<script lang="ts">
	import { AlertTriangle, Check, ShieldCheck, Zap } from 'lucide-svelte';
	import {
		Badge,
		Card,
		Select,
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui';
	import type { BranchResult, CircuitDocument, FullSolveResult, NodeResult } from '$lib/engine/types';
	import { settings } from '$lib/stores/settings.svelte';
	import { cn } from '$lib/utils';
	import {
		formatComplexParts,
		formatFrequency,
		formatPowerFactor,
		formatReactivePower,
		formatRealPower
	} from './formatters';

	type Props = {
		solution: FullSolveResult;
		document: CircuitDocument;
		selectedComponentId?: string | null;
		onSelectComponent?: (id: string) => void;
		onSelectTheveninComponent?: (id: string) => void;
		class?: string;
	};

	let {
		solution,
		document,
		selectedComponentId = null,
		onSelectComponent,
		onSelectTheveninComponent,
		class: className
	}: Props = $props();

	const mna = $derived(solution.mna);
	const isAc = $derived(mna.mode === 'ac');
	const formatOpts = $derived({
		angleDisplay: settings.angleDisplay,
		precision: settings.precision,
		showDcFractions: settings.showDcFractions
	});

	const sortedNodes = $derived.by<NodeResult[]>(() => {
		const nodes = Object.values(mna.nodeVoltages);
		return nodes.sort((a, b) => {
			if (a.isReference) return -1;
			if (b.isReference) return 1;
			return a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true });
		});
	});

	const sortedBranches = $derived.by<BranchResult[]>(() => {
		return Object.values(mna.branches).sort((a, b) =>
			a.label.localeCompare(b.label, undefined, { numeric: true })
		);
	});

	const passiveOptions = $derived(
		document.components
			.filter((c) => c.kind === 'resistor' || c.kind === 'capacitor' || c.kind === 'inductor')
			.map((c) => ({ value: c.id, label: `${c.label} (${c.value})` }))
	);

	const theveninLoadLabel = $derived.by(() => {
		const tn = solution.theveninNorton;
		if (!tn) return '';
		if (tn.loadComponentId) {
			const comp = document.components.find((c) => c.id === tn.loadComponentId);
			return comp ? `Across ${comp.label} (${tn.terminalA} – ${tn.terminalB})` : `Port ${tn.terminalA} – ${tn.terminalB}`;
		}
		return `Terminals ${tn.terminalA} – ${tn.terminalB}`;
	});

	function formatAttachmentList(node: NodeResult): string {
		if (node.componentPins.length === 0) return '—';
		const labelById = new Map(document.components.map((c) => [c.id, c.label]));
		return node.componentPins
			.map((p) => `${labelById.get(p.componentId) ?? p.componentId}(${p.pinName})`)
			.join(', ');
	}
</script>

<div class={cn('flex flex-col gap-4', className)}>
	<!-- Verification & Summary Strip -->
	<div
		class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 shadow-2xs"
	>
		<div class="flex flex-wrap items-center gap-2">
			<Badge variant="outline" class="font-engineering">
				{#if isAc}
					AC · {formatFrequency(mna.frequencyHz)} · {(mna.acMagnitudeMode ?? 'rms').toUpperCase()}
				{:else}
					DC Steady-State
				{/if}
			</Badge>

			{#if solution.allVerified}
				<Badge variant="success">
					<ShieldCheck class="size-3" aria-hidden="true" />
					Verified · Δ &lt; 1e-8
				</Badge>
			{:else}
				<Badge variant="warning">
					<AlertTriangle class="size-3" aria-hidden="true" />
					Discrepancy Δ = {solution.maxDiscrepancy.toExponential(2)}
				</Badge>
			{/if}

			{#if mna.powerBalance.balanced}
				<Badge variant="success" class="font-engineering">
					<Check class="size-3" aria-hidden="true" />
					ΣP = 0 W
				</Badge>
			{:else}
				<Badge variant="warning" class="font-engineering">
					ΣP = {formatRealPower(mna.powerBalance.totalRealPower, formatOpts)}
				</Badge>
			{/if}
		</div>

		<span class="font-engineering text-[11px] text-muted-foreground">
			{sortedNodes.length} nodes · {sortedBranches.length} branches
		</span>
	</div>

	<!-- Node Voltages Table -->
	<section aria-label="Final Node Voltages">
		<div class="mb-1.5 flex items-baseline justify-between">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Node Voltages
			</h3>
			<span class="text-[11px] text-muted-foreground">Referenced to GND (0 V)</span>
		</div>
		<Table>
			<TableHeader>
				<TableRow class="hover:bg-transparent">
					<TableHead>Node</TableHead>
					<TableHead>Connections</TableHead>
					<TableHead class="text-right">Voltage</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each sortedNodes as node (node.nodeId)}
					{@const vParts = formatComplexParts(node.voltage, 'V', mna.mode, formatOpts)}
					<TableRow>
						<TableCell class="font-engineering font-semibold">
							{#if node.isReference}
								<span>0</span>
								<Badge variant="secondary" class="ml-1.5 text-[10px]">GND</Badge>
							{:else}
								{node.nodeId}
							{/if}
						</TableCell>
						<TableCell class="max-w-[200px] truncate text-[11px] text-muted-foreground">
							{formatAttachmentList(node)}
						</TableCell>
						<TableCell tabular class="whitespace-nowrap text-right font-medium text-voltage">
							<div class="whitespace-nowrap">{vParts.primary}</div>
							{#if vParts.secondary}
								<div class="whitespace-nowrap text-[11px] font-normal text-muted-foreground">
									{vParts.secondary}
								</div>
							{/if}
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</section>

	<!-- Branch Results Table -->
	<section aria-label="Final Branch Currents, Voltages, and Power">
		<div class="mb-1.5 flex items-baseline justify-between">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Branch Quantities
			</h3>
			<span class="text-[11px] text-muted-foreground">
				Passive sign (+ absorbed, − supplied) · Click row to highlight
			</span>
		</div>
		<Table>
			<TableHeader>
				<TableRow class="hover:bg-transparent">
					<TableHead class="px-1.5">Element</TableHead>
					<TableHead class="px-1.5 text-right">Voltage</TableHead>
					<TableHead class="px-1.5 text-right">Current</TableHead>
					<TableHead class="px-1.5 text-right">Power</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each sortedBranches as branch (branch.componentId)}
					{@const vParts = formatComplexParts(branch.voltage, 'V', mna.mode, formatOpts)}
					{@const iParts = formatComplexParts(branch.current, 'A', mna.mode, formatOpts)}
					{@const isSupplied = branch.realPower < -1e-12}
					{@const isSelected = selectedComponentId === branch.componentId}
					<TableRow
						data-selected={isSelected ? 'true' : undefined}
						class={cn(
							onSelectComponent && 'cursor-pointer',
							isSelected && 'bg-primary/10 hover:bg-primary/15'
						)}
						tabindex={onSelectComponent ? 0 : undefined}
						onclick={() => onSelectComponent?.(branch.componentId)}
						onkeydown={(e) => {
							if (onSelectComponent && (e.key === 'Enter' || e.key === ' ')) {
								e.preventDefault();
								onSelectComponent(branch.componentId);
							}
						}}
					>
						<TableCell class="px-1.5 py-2">
							<div class="font-engineering font-semibold text-foreground">{branch.label}</div>
							<div class="font-engineering whitespace-nowrap text-[10px] text-muted-foreground">
								{branch.nodeA} → {branch.nodeB}
							</div>
						</TableCell>
						<TableCell tabular class="px-1.5 py-2 text-right text-[11px] whitespace-nowrap text-voltage">
							<div class="whitespace-nowrap">{vParts.primary}</div>
							{#if vParts.secondary}
								<div class="whitespace-nowrap text-[10px] text-muted-foreground">{vParts.secondary}</div>
							{/if}
						</TableCell>
						<TableCell tabular class="px-1.5 py-2 text-right text-[11px] whitespace-nowrap text-branch-current">
							<div class="whitespace-nowrap">{iParts.primary}</div>
							{#if iParts.secondary}
								<div class="whitespace-nowrap text-[10px] text-muted-foreground">{iParts.secondary}</div>
							{/if}
						</TableCell>
						<TableCell tabular class="px-1.5 py-2 text-right text-[11px] whitespace-nowrap">
							<div class="whitespace-nowrap">
								<span
									class={cn(
										'font-medium',
										isSupplied ? 'text-branch-current' : 'text-foreground'
									)}
								>
									{formatRealPower(branch.realPower, formatOpts)}
								</span>
								<span class="ml-0.5 text-[10px] text-muted-foreground">
									{Math.abs(branch.realPower) < 1e-12
										? '· 0'
										: isSupplied
											? 'Supplied'
											: 'Absorbed'}
								</span>
							</div>
							{#if isAc}
								<div class="whitespace-nowrap text-[10px] text-muted-foreground">
									Q: {formatReactivePower(branch.reactivePower, formatOpts)}
								</div>
								<div class="whitespace-nowrap text-[10px] text-muted-foreground">
									PF: {formatPowerFactor(branch.powerFactor, branch.powerFactorType)}
								</div>
							{/if}
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</section>

	<!-- Thévenin & Norton Equivalent Summary Card -->
	{#if solution.theveninNorton}
		{@const tn = solution.theveninNorton}
		{@const vthParts = formatComplexParts(tn.vth, 'V', mna.mode, formatOpts)}
		{@const zthParts = tn.zth ? formatComplexParts(tn.zth, 'Ω', mna.mode, formatOpts) : null}
		{@const iscParts = tn.isc ? formatComplexParts(tn.isc, 'A', mna.mode, formatOpts) : null}
		<Card class="overflow-hidden">
			{#snippet header()}
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<Zap class="size-4 text-primary" aria-hidden="true" />
						<div>
							<h3 class="text-sm font-semibold leading-none tracking-tight">
								Thévenin &amp; Norton Equivalent
							</h3>
							<p class="mt-0.5 text-xs text-muted-foreground">{theveninLoadLabel}</p>
						</div>
					</div>
					{#if onSelectTheveninComponent && passiveOptions.length > 0}
						<div class="w-40">
							<Select
								aria-label="Select Thévenin load component"
								value={tn.loadComponentId ?? ''}
								options={passiveOptions}
								onchange={(e) => {
									const val = (e.currentTarget as HTMLSelectElement).value;
									if (val) onSelectTheveninComponent(val);
								}}
								class="h-7 text-xs"
							/>
						</div>
					{/if}
				</div>
			{/snippet}

			<div class="grid grid-cols-1 gap-2">
				<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-rail/60 px-3 py-2">
					<div class="text-xs font-medium text-muted-foreground">
						Open-Circuit Voltage (V<sub>th</sub>)
					</div>
					<div class="text-right">
						<div class="font-engineering whitespace-nowrap text-sm font-semibold text-voltage">
							{vthParts.primary}
						</div>
						{#if vthParts.secondary}
							<div class="font-engineering whitespace-nowrap text-[11px] text-muted-foreground">
								{vthParts.secondary}
							</div>
						{/if}
					</div>
				</div>

				<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-rail/60 px-3 py-2">
					<div class="text-xs font-medium text-muted-foreground">
						Norton Current (I<sub>N</sub>)
					</div>
					<div class="text-right">
						<div class="font-engineering whitespace-nowrap text-sm font-semibold text-branch-current">
							{#if iscParts}
								{iscParts.primary}
							{:else}
								Undefined (Z<sub>th</sub> = 0)
							{/if}
						</div>
						{#if iscParts?.secondary}
							<div class="font-engineering whitespace-nowrap text-[11px] text-muted-foreground">
								{iscParts.secondary}
							</div>
						{/if}
					</div>
				</div>

				<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-rail/60 px-3 py-2">
					<div class="text-xs font-medium text-muted-foreground">
						Equivalent {#if isAc}Impedance (Z<sub>th</sub>){:else}Resistance (R<sub>th</sub>){/if}
					</div>
					<div class="text-right">
						<div class="font-engineering whitespace-nowrap text-sm font-semibold text-foreground">
							{zthParts ? zthParts.primary : 'Open / Dependent'}
						</div>
						{#if zthParts?.secondary}
							<div class="font-engineering whitespace-nowrap text-[11px] text-muted-foreground">
								{zthParts.secondary}
							</div>
						{/if}
					</div>
				</div>
			</div>

			{#if tn.maxPowerTransfer}
				{@const zOptParts = formatComplexParts(
					tn.maxPowerTransfer.optimalLoadImpedance,
					'Ω',
					mna.mode,
					formatOpts
				)}
				<div
					class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs"
				>
					<span class="font-medium text-muted-foreground">Maximum Power Transfer</span>
					<div class="font-engineering flex flex-wrap items-center gap-x-3 gap-y-1 text-foreground">
						<span class="whitespace-nowrap">
							{#if isAc}Z<sub>L,opt</sub>{:else}R<sub>L,opt</sub>{/if} = {zOptParts.primary}
						</span>
						<span class="text-border" aria-hidden="true">|</span>
						<span class="whitespace-nowrap font-semibold text-branch-current">
							P<sub>max</sub> = {formatRealPower(tn.maxPowerTransfer.maxRealPowerW, formatOpts)}
						</span>
					</div>
				</div>
			{/if}
		</Card>
	{/if}
</div>
