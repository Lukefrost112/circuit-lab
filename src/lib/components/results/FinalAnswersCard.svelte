<script lang="ts">
	import {
		Badge,
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
			return comp
				? `Across ${comp.label} (${tn.terminalA} – ${tn.terminalB})`
				: `Port ${tn.terminalA} – ${tn.terminalB}`;
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

<div class={cn('flex min-w-0 flex-col divide-y divide-border', className)}>
	<!-- Status & Telemetry Strip -->
	<div
		class="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-surface-rail/60 px-4 py-2.5 text-[11px]"
	>
		<div class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
			<span class="font-engineering font-semibold text-foreground">
				{#if isAc}
					AC · {formatFrequency(mna.frequencyHz)} · {(mna.acMagnitudeMode ?? 'rms').toUpperCase()}
				{:else}
					DC Steady-State
				{/if}
			</span>
			<span class="font-engineering whitespace-nowrap text-muted-foreground">
				· {sortedNodes.length} {sortedNodes.length === 1 ? 'node' : 'nodes'} · {sortedBranches.length} {sortedBranches.length === 1 ? 'branch' : 'branches'}
			</span>
		</div>

		<div class="font-engineering flex flex-wrap items-center gap-x-2 gap-y-0.5 whitespace-nowrap">
			{#if mna.powerBalance.balanced}
				<span class="inline-flex items-center gap-1.5 text-foreground">
					<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-branch-current" aria-hidden="true"></span>
					<span>ΣP = 0 W</span>
				</span>
			{:else}
				<span class="inline-flex items-center gap-1.5 text-warning">
					<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true"></span>
					<span>ΣP = {formatRealPower(mna.powerBalance.totalRealPower, formatOpts)}</span>
				</span>
			{/if}

			<span class="text-muted-foreground/60" aria-hidden="true">·</span>

			{#if solution.allVerified}
				<span class="text-muted-foreground" title="All applicable methods verified against MNA">
					Δ &lt; 1e-8
				</span>
			{:else}
				<span class="font-medium text-warning">
					Δ = {solution.maxDiscrepancy.toExponential(2)}
				</span>
			{/if}
		</div>
	</div>

	<!-- Node Voltages -->
	<section aria-label="Final Node Voltages" class="py-3">
		<div class="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 px-4">
			<h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				Node Voltages
			</h3>
			<span class="text-[11px] text-muted-foreground">Referenced to GND (0 V)</span>
		</div>
		<Table variant="flush">
			<TableHeader class="border-t border-border bg-surface-rail/50">
				<TableRow class="hover:bg-transparent">
					<TableHead class="h-7 pl-4 pr-2 text-[10px]">Node</TableHead>
					<TableHead class="hidden h-7 px-2 text-[10px] sm:table-cell">Connections</TableHead>
					<TableHead class="h-7 pl-2 pr-4 text-right text-[10px]">Voltage</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each sortedNodes as node (node.nodeId)}
					{@const vParts = formatComplexParts(node.voltage, 'V', mna.mode, formatOpts)}
					{@const attachments = formatAttachmentList(node)}
					<TableRow>
						<TableCell class="py-2 pl-4 pr-2 align-top sm:align-middle">
							<div class="font-engineering font-semibold">
								{#if node.isReference}
									<span>0</span>
									<Badge variant="secondary" class="ml-1.5 px-1 py-0 text-[10px]">GND</Badge>
								{:else}
									{node.nodeId}
								{/if}
							</div>
							<div class="mt-0.5 text-[11px] leading-snug text-muted-foreground sm:hidden">
								{attachments}
							</div>
						</TableCell>
						<TableCell class="hidden max-w-[200px] truncate px-2 py-2 text-[11px] text-muted-foreground sm:table-cell">
							{attachments}
						</TableCell>
						<TableCell
							tabular
							class="whitespace-nowrap py-2 pl-2 pr-4 align-top text-right font-medium text-voltage sm:align-middle"
						>
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

	<!-- Branch Quantities: Flush List on < sm, Flush Table on sm+ -->
	<section aria-label="Final Branch Currents, Voltages, and Power" class="py-3">
		<div class="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 px-4">
			<h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				Branch Quantities
			</h3>
			<span class="text-[11px] text-muted-foreground">
				Passive sign (+ absorbed, − supplied) · <span class="hidden sm:inline">Click row</span><span class="sm:hidden">Tap row</span> to highlight
			</span>
		</div>

		<!-- Mobile Flush Interactive Branch List (< sm) -->
		<div class="flex flex-col divide-y divide-border border-t border-border sm:hidden">
			{#each sortedBranches as branch (branch.componentId)}
				{@const vParts = formatComplexParts(branch.voltage, 'V', mna.mode, formatOpts)}
				{@const iParts = formatComplexParts(branch.current, 'A', mna.mode, formatOpts)}
				{@const isSupplied = branch.realPower < -1e-12}
				{@const isSelected = selectedComponentId === branch.componentId}
				<button
					type="button"
					data-selected={isSelected ? 'true' : undefined}
					aria-pressed={onSelectComponent ? isSelected : undefined}
					onclick={() => onSelectComponent?.(branch.componentId)}
					class={cn(
						'min-h-11 w-full px-4 py-3 text-left transition-colors duration-150',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
						onSelectComponent && 'cursor-pointer hover:bg-accent/35',
						isSelected && 'bg-primary/8'
					)}
				>
					<div class="flex items-baseline justify-between gap-2">
						<div class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
							<span class="font-engineering text-xs font-semibold text-foreground">
								{branch.label}
							</span>
							<span class="font-engineering whitespace-nowrap text-[11px] text-muted-foreground">
								{branch.nodeA} → {branch.nodeB}
							</span>
						</div>
						<div class="flex shrink-0 items-baseline gap-1.5 font-engineering text-xs">
							<span
								class={cn(
									'whitespace-nowrap font-semibold',
									isSupplied ? 'text-branch-current' : 'text-foreground'
								)}
							>
								{formatRealPower(branch.realPower, formatOpts)}
							</span>
							<span class="whitespace-nowrap font-sans text-[10px] text-muted-foreground">
								{Math.abs(branch.realPower) < 1e-12
									? '· 0'
									: isSupplied
										? 'Supplied'
										: 'Absorbed'}
							</span>
						</div>
					</div>

					<div class="mt-2 grid grid-cols-2 gap-3">
						<div class="min-w-0">
							<div class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
								Voltage
							</div>
							<div class="mt-0.5 font-engineering text-xs font-medium break-words text-voltage">
								{vParts.primary}
							</div>
							{#if vParts.secondary}
								<div class="font-engineering text-[11px] break-words text-muted-foreground">
									{vParts.secondary}
								</div>
							{/if}
						</div>
						<div class="min-w-0">
							<div class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
								Current
							</div>
							<div class="mt-0.5 font-engineering text-xs font-medium break-words text-branch-current">
								{iParts.primary}
							</div>
							{#if iParts.secondary}
								<div class="font-engineering text-[11px] break-words text-muted-foreground">
									{iParts.secondary}
								</div>
							{/if}
						</div>
					</div>

					{#if isAc}
						<div
							class="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 font-engineering text-[11px] text-muted-foreground"
						>
							<span>Q: {formatReactivePower(branch.reactivePower, formatOpts)}</span>
							<span>PF: {formatPowerFactor(branch.powerFactor, branch.powerFactorType)}</span>
						</div>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Desktop / Tablet 4-Column Flush Table (sm+) -->
		<div class="hidden sm:block">
			<Table variant="flush">
				<TableHeader class="border-t border-border bg-surface-rail/50">
					<TableRow class="hover:bg-transparent">
						<TableHead class="h-7 pl-4 pr-1.5 text-[10px]">Element</TableHead>
						<TableHead class="h-7 px-1.5 text-right text-[10px]">Voltage</TableHead>
						<TableHead class="h-7 px-1.5 text-right text-[10px]">Current</TableHead>
						<TableHead class="h-7 pl-1.5 pr-4 text-right text-[10px]">Power</TableHead>
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
							<TableCell class="py-2 pl-4 pr-1.5">
								<div class="font-engineering font-semibold text-foreground">{branch.label}</div>
								<div class="font-engineering whitespace-nowrap text-[10px] text-muted-foreground">
									{branch.nodeA} → {branch.nodeB}
								</div>
							</TableCell>
							<TableCell tabular class="whitespace-nowrap px-1.5 py-2 text-right text-[11px] text-voltage">
								<div class="whitespace-nowrap">{vParts.primary}</div>
								{#if vParts.secondary}
									<div class="whitespace-nowrap text-[10px] text-muted-foreground">{vParts.secondary}</div>
								{/if}
							</TableCell>
							<TableCell tabular class="whitespace-nowrap px-1.5 py-2 text-right text-[11px] text-branch-current">
								<div class="whitespace-nowrap">{iParts.primary}</div>
								{#if iParts.secondary}
									<div class="whitespace-nowrap text-[10px] text-muted-foreground">{iParts.secondary}</div>
								{/if}
							</TableCell>
							<TableCell tabular class="whitespace-nowrap py-2 pl-1.5 pr-4 text-right text-[11px]">
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
		</div>
	</section>

	<!-- Thévenin & Norton Equivalent Flush Datasheet Ledger -->
	{#if solution.theveninNorton}
		{@const tn = solution.theveninNorton}
		{@const vthParts = formatComplexParts(tn.vth, 'V', mna.mode, formatOpts)}
		{@const zthParts = tn.zth ? formatComplexParts(tn.zth, 'Ω', mna.mode, formatOpts) : null}
		{@const iscParts = tn.isc ? formatComplexParts(tn.isc, 'A', mna.mode, formatOpts) : null}
		<section aria-label="Thévenin and Norton Equivalent" class="px-4 py-3.5">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="min-w-0">
					<h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Thévenin &amp; Norton Equivalent
					</h3>
					<p class="mt-0.5 text-xs text-foreground">{theveninLoadLabel}</p>
				</div>
				{#if onSelectTheveninComponent && passiveOptions.length > 0}
					<div class="w-full sm:w-44">
						<Select
							aria-label="Select Thévenin load component"
							value={tn.loadComponentId ?? ''}
							options={passiveOptions}
							onchange={(e) => {
								const val = (e.currentTarget as HTMLSelectElement).value;
								if (val) onSelectTheveninComponent(val);
							}}
							class="min-h-11 text-base sm:min-h-0 sm:h-7 sm:text-xs"
						/>
					</div>
				{/if}
			</div>

			<div class="mt-3 divide-y divide-border border-y border-border">
				<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
					<span class="text-xs text-muted-foreground">
						Open-Circuit Voltage (V<sub>th</sub>)
					</span>
					<div class="ml-auto text-right">
						<div class="font-engineering whitespace-nowrap text-xs font-semibold text-voltage">
							{vthParts.primary}
						</div>
						{#if vthParts.secondary}
							<div class="font-engineering whitespace-nowrap text-[11px] text-muted-foreground">
								{vthParts.secondary}
							</div>
						{/if}
					</div>
				</div>

				<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
					<span class="text-xs text-muted-foreground">
						Norton Current (I<sub>N</sub>)
					</span>
					<div class="ml-auto text-right">
						<div class="font-engineering whitespace-nowrap text-xs font-semibold text-branch-current">
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

				<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
					<span class="text-xs text-muted-foreground">
						Equivalent {#if isAc}Impedance (Z<sub>th</sub>){:else}Resistance (R<sub>th</sub>){/if}
					</span>
					<div class="ml-auto text-right">
						<div class="font-engineering whitespace-nowrap text-xs font-semibold text-foreground">
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
				<div class="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
					<span class="text-muted-foreground">Maximum Power Transfer</span>
					<div class="font-engineering flex flex-wrap items-center gap-x-2 gap-y-0.5 text-foreground">
						<span class="whitespace-nowrap">
							{#if isAc}Z<sub>L,opt</sub>{:else}R<sub>L,opt</sub>{/if} = {zOptParts.primary}
						</span>
						<span class="text-muted-foreground" aria-hidden="true">·</span>
						<span class="whitespace-nowrap font-semibold text-branch-current">
							P<sub>max</sub> = {formatRealPower(tn.maxPowerTransfer.maxRealPowerW, formatOpts)}
						</span>
					</div>
				</div>
			{/if}
		</section>
	{/if}
</div>
