<script lang="ts">
	import { RotateCw, Target, Trash2 } from 'lucide-svelte';
	import { CircuitSymbol } from '$lib/components/symbols';
	import { Button, Input, Label, Select, Switch } from '$lib/components/ui';
	import { formatEngineering, parseComplexValue, type ComponentKind } from '$lib/engine';
	import { circuit } from '$lib/stores/circuit.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import EngineeringInput from './EngineeringInput.svelte';

	const KIND_LABELS: Record<ComponentKind, string> = {
		resistor: 'Resistor',
		capacitor: 'Capacitor',
		inductor: 'Inductor',
		voltage_source: 'Voltage Source',
		current_source: 'Current Source',
		ground: 'Ground (0 V)',
		terminal: 'Port Terminal'
	};

	const UNIT_BY_KIND: Partial<Record<ComponentKind, string>> = {
		resistor: 'Ω',
		capacitor: 'F',
		inductor: 'H',
		voltage_source: 'V',
		current_source: 'A'
	};

	const selectedComp = $derived(circuit.selectedComponent);
	const selectedWire = $derived(circuit.selectedWire);

	let labelDraft = $state('');
	let terminalNameDraft = $state('');
	let phaseDraft = $state('0');
	let sourceFreqDraft = $state('');
	let globalFreqDraft = $state(String(circuit.document.frequencyHz));

	$effect(() => {
		if (selectedComp) {
			labelDraft = selectedComp.label;
			terminalNameDraft = selectedComp.terminalName ?? '';

			const parsed = parseComplexValue(selectedComp.value);
			if (selectedComp.phaseDeg !== undefined && Number.isFinite(selectedComp.phaseDeg)) {
				phaseDraft = String(selectedComp.phaseDeg);
			} else if (parsed && !parsed.isZero()) {
				const deg = Math.abs(parsed.argDeg()) < 1e-9 ? 0 : Number(parsed.argDeg().toFixed(4));
				phaseDraft = String(deg);
			} else {
				phaseDraft = '0';
			}

			sourceFreqDraft =
				selectedComp.frequencyHz !== undefined ? String(selectedComp.frequencyHz) : '';
		}
	});

	$effect(() => {
		globalFreqDraft = String(circuit.document.frequencyHz);
	});

	const isSource = $derived(
		selectedComp?.kind === 'voltage_source' || selectedComp?.kind === 'current_source'
	);
	const isPassive = $derived(
		selectedComp?.kind === 'resistor' ||
			selectedComp?.kind === 'capacitor' ||
			selectedComp?.kind === 'inductor'
	);
	const isTwoTerminal = $derived(
		selectedComp !== null &&
			selectedComp.kind !== 'ground' &&
			selectedComp.kind !== 'terminal'
	);
	const isAcMode = $derived(circuit.document.mode === 'ac');
	const isTheveninTarget = $derived(
		selectedComp !== null &&
			circuit.theveninTarget?.kind === 'component' &&
			circuit.theveninTarget.componentId === selectedComp.id
	);

	const selectedWireNodeId = $derived.by(() => {
		if (!selectedWire || selectedWire.points.length === 0) return null;
		const pt = selectedWire.points[0];
		for (const [nodeId, node] of Object.entries(circuit.graph.nodes)) {
			if (node.gridPoints.some((gp) => gp.x === pt.x && gp.y === pt.y)) {
				return nodeId;
			}
		}
		return null;
	});

	function commitLabel() {
		if (!selectedComp) return;
		const trimmed = labelDraft.trim();
		if (!trimmed) {
			labelDraft = selectedComp.label;
			return;
		}
		if (trimmed !== selectedComp.label) {
			circuit.updateComponent(selectedComp.id, { label: trimmed });
		}
	}

	function commitTerminalName() {
		if (!selectedComp || selectedComp.kind !== 'terminal') return;
		const trimmed = terminalNameDraft.trim();
		if (trimmed !== (selectedComp.terminalName ?? '')) {
			circuit.updateComponent(selectedComp.id, { terminalName: trimmed || undefined });
		}
	}

	function commitPhase() {
		if (!selectedComp || !isSource) return;
		const deg = Number(phaseDraft);
		if (!Number.isFinite(deg)) {
			phaseDraft = String(selectedComp.phaseDeg ?? 0);
			return;
		}

		const raw = selectedComp.value.trim();
		const hasExplicitAngleOrJ = /[∠@j]/i.test(raw);
		const parsed = parseComplexValue(raw);

		if (hasExplicitAngleOrJ && parsed) {
			const mag = parsed.abs();
			const magStr = formatEngineering(mag, '', 6).replace(/\s+/g, '');
			circuit.updateComponent(selectedComp.id, {
				phaseDeg: deg,
				value: `${magStr}∠${deg}°`
			});
		} else {
			circuit.updateComponent(selectedComp.id, { phaseDeg: deg });
		}
	}

	function commitSourceFrequency() {
		if (!selectedComp || !isSource) return;
		const trimmed = sourceFreqDraft.trim();
		if (trimmed === '') {
			if (selectedComp.frequencyHz !== undefined) {
				circuit.updateComponent(selectedComp.id, { frequencyHz: undefined });
			}
			return;
		}
		const hz = Number(trimmed);
		if (!Number.isFinite(hz) || hz <= 0) {
			sourceFreqDraft =
				selectedComp.frequencyHz !== undefined ? String(selectedComp.frequencyHz) : '';
			return;
		}
		if (hz !== selectedComp.frequencyHz) {
			circuit.updateComponent(selectedComp.id, { frequencyHz: hz });
		}
	}

	function commitGlobalFrequency() {
		const hz = Number(globalFreqDraft);
		if (!Number.isFinite(hz) || hz <= 0) {
			globalFreqDraft = String(circuit.document.frequencyHz);
			return;
		}
		circuit.setFrequency(hz);
	}

	function toggleThevenin() {
		if (!selectedComp) return;
		if (isTheveninTarget) {
			circuit.clearTheveninTarget();
		} else {
			circuit.setTheveninComponent(selectedComp.id);
		}
	}
</script>

<div class="flex flex-col divide-y divide-border">
	{#if selectedComp}
		<!-- Component Identity Header -->
		<div class="flex items-center justify-between gap-2 px-4 py-3.5">
			<div class="flex min-w-0 items-center gap-2.5">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-border bg-surface-rail text-foreground">
					<CircuitSymbol
						kind={selectedComp.kind}
						variant="icon"
						sourceMode={isAcMode || /[∠@j]/i.test(selectedComp.value) ? 'ac' : 'dc'}
						terminalLabel={selectedComp.terminalName || selectedComp.label}
						size={20}
					/>
				</div>
				<div class="min-w-0">
					<div class="truncate font-engineering text-sm font-semibold text-foreground">
						{selectedComp.label}
					</div>
					<div class="text-[11px] text-muted-foreground">
						{KIND_LABELS[selectedComp.kind]}
					</div>
				</div>
			</div>
			<span class="font-engineering shrink-0 text-[11px] text-muted-foreground">
				({selectedComp.x}, {selectedComp.y}) · {selectedComp.rotation}°
			</span>
		</div>

		<!-- Component Properties Form -->
		<div class="flex flex-col gap-3 px-4 py-3.5">
			<div class="flex flex-col gap-1.5">
				<Label for="comp-label">Designator / Label</Label>
				<Input
					id="comp-label"
					tabular
					bind:value={labelDraft}
					onblur={commitLabel}
					onkeydown={(e) => {
						if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
					}}
				/>
			</div>

			{#if selectedComp.kind === 'terminal'}
				<div class="flex flex-col gap-1.5">
					<Label for="comp-terminal-name">Port Name</Label>
					<Input
						id="comp-terminal-name"
						tabular
						placeholder="e.g. A, B"
						bind:value={terminalNameDraft}
						onblur={commitTerminalName}
						onkeydown={(e) => {
							if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
						}}
					/>
				</div>
			{:else if selectedComp.kind !== 'ground'}
				<div class="flex flex-col gap-1.5">
					<Label for="comp-value">
						{isSource ? (isAcMode ? 'Magnitude / Phasor' : 'DC Value') : 'Value'}
					</Label>
					<EngineeringInput
						id="comp-value"
						value={selectedComp.value}
						unit={selectedComp.unit ?? UNIT_BY_KIND[selectedComp.kind] ?? ''}
						allowComplex={isSource && isAcMode}
						positiveOnly={isPassive}
						allowZero={isSource}
						onCommit={(val) => circuit.updateComponent(selectedComp.id, { value: val })}
					/>
				</div>
			{/if}

			{#if isSource && isAcMode}
				<div class="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="comp-phase">AC Phase (°)</Label>
						<Input
							id="comp-phase"
							type="number"
							step="any"
							tabular
							bind:value={phaseDraft}
							onblur={commitPhase}
							onkeydown={(e) => {
								if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
							}}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="comp-freq">Source Freq (Hz)</Label>
						<Input
							id="comp-freq"
							type="number"
							min="0.001"
							step="any"
							tabular
							placeholder={String(circuit.document.frequencyHz)}
							bind:value={sourceFreqDraft}
							onblur={commitSourceFrequency}
							onkeydown={(e) => {
								if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
							}}
						/>
					</div>
				</div>
				<p class="text-[11px] leading-snug text-muted-foreground">
					Optional per-source frequency enables multi-frequency AC Superposition.
				</p>
			{/if}
		</div>

		<!-- Component Actions -->
		<div class="flex flex-col gap-2 px-4 py-3.5">
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					class="h-11 min-h-11 flex-1 lg:h-7 lg:min-h-0"
					onclick={() => circuit.rotateComponent(selectedComp.id)}
				>
					<RotateCw class="size-3.5" aria-hidden="true" />
					<span>Rotate 90°</span>
				</Button>
				<Button
					variant="destructive"
					size="sm"
					class="h-11 min-h-11 lg:h-7 lg:min-h-0"
					onclick={() => circuit.deleteComponent(selectedComp.id)}
				>
					<Trash2 class="size-3.5" aria-hidden="true" />
					<span>Delete</span>
				</Button>
			</div>

			{#if isTwoTerminal}
				<Button
					variant={isTheveninTarget ? 'default' : 'secondary'}
					size="sm"
					class="h-auto min-h-11 w-full whitespace-normal py-2 text-center lg:h-7 lg:min-h-0 lg:whitespace-nowrap lg:py-0"
					onclick={toggleThevenin}
				>
					<Target class="size-3.5" aria-hidden="true" />
					<span>
						{isTheveninTarget
							? 'Clear Thévenin / Norton Target'
							: 'Analyze Thévenin / Norton Across Element'}
					</span>
				</Button>
			{/if}
		</div>
	{:else if selectedWire}
		<!-- Wire Identity Header -->
		<div class="flex items-center justify-between gap-2 px-4 py-3.5">
			<h2 class="text-xs font-semibold text-foreground">Selected Wire</h2>
			<span class="font-engineering text-xs text-muted-foreground">{selectedWire.id}</span>
		</div>

		<!-- Wire Details -->
		<div class="flex flex-col gap-2 px-4 py-3.5 text-xs">
			<div class="flex items-center justify-between">
				<span class="text-muted-foreground">Electrical Node</span>
				<span class="font-engineering font-medium text-voltage">
					{selectedWireNodeId === '0'
						? 'GND (0)'
						: selectedWireNodeId ?? 'Unconnected'}
				</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-muted-foreground">Vertices</span>
				<span class="font-engineering text-foreground">
					{selectedWire.points.length}
				</span>
			</div>
			<div class="rounded-[4px] border border-border bg-surface-rail/60 px-2.5 py-1.5 font-engineering text-[11px] text-muted-foreground">
				{selectedWire.points.map((p) => `(${p.x},${p.y})`).join(' → ')}
			</div>
		</div>

		<!-- Wire Actions -->
		<div class="px-4 py-3.5">
			<Button
				variant="destructive"
				size="sm"
				class="h-11 min-h-11 w-full lg:h-7 lg:min-h-0"
				onclick={() => circuit.deleteWire(selectedWire.id)}
			>
				<Trash2 class="size-3.5" aria-hidden="true" />
				<span>Delete Wire</span>
			</Button>
		</div>
	{:else}
		<!-- Empty Selection -->
		<div class="px-4 py-3.5">
			<h2 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				No Element Selected
			</h2>
			<p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
				Tap or click any component or wire on the schematic canvas to edit values, rotate, or set a
				Thévenin load port. Tap or click any pin circle to draw an orthogonal wire.
			</p>
		</div>

		<!-- Simulation Parameters -->
		<div class="flex flex-col gap-3 px-4 py-3.5">
			<h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				Simulation Parameters
			</h3>

			{#if isAcMode}
				<div class="flex flex-col gap-1.5">
					<Label for="inspector-ac-freq">Drive Frequency (Hz)</Label>
					<Input
						id="inspector-ac-freq"
						type="number"
						min="0.001"
						step="any"
						tabular
						bind:value={globalFreqDraft}
						onblur={commitGlobalFrequency}
						onkeydown={(e) => {
							if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
						}}
					/>
				</div>
			{/if}

			<div class="flex flex-col gap-1.5">
				<Label for="inspector-symbol-standard">Schematic Standard</Label>
				<Select
					id="inspector-symbol-standard"
					value={settings.schematicStandard}
					onchange={(e) => {
						const val = (e.currentTarget as HTMLSelectElement).value;
						if (val === 'ieee' || val === 'iec') {
							settings.schematicStandard = val;
						}
					}}
					options={[
						{ value: 'ieee', label: 'IEEE / ANSI (Zigzag Resistor)' },
						{ value: 'iec', label: 'IEC 60617 (Rectangular Resistor)' }
					]}
				/>
			</div>
		</div>

		<!-- Canvas Display Toggles -->
		<div class="flex flex-col gap-2 px-4 py-3.5">
			<div class="flex min-h-11 items-center justify-between gap-2 py-1 lg:min-h-0 lg:py-0">
				<div class="flex flex-col gap-0.5">
					<Label for="inspector-snap-grid">Grid Snapping</Label>
					<span class="text-[11px] text-muted-foreground">20 px pitch alignment</span>
				</div>
				<Switch
					id="inspector-snap-grid"
					checked={settings.snapToGrid}
					onCheckedChange={(checked) => (settings.snapToGrid = checked)}
				/>
			</div>

			<div class="flex min-h-11 items-center justify-between gap-2 py-1 lg:min-h-0 lg:py-0">
				<div class="flex flex-col gap-0.5">
					<Label for="inspector-show-grid">Show Grid</Label>
					<span class="text-[11px] text-muted-foreground">20 px dots &amp; major lines</span>
				</div>
				<Switch
					id="inspector-show-grid"
					checked={settings.showGrid}
					onCheckedChange={(checked) => (settings.showGrid = checked)}
				/>
			</div>

			<div class="flex min-h-11 items-center justify-between gap-2 py-1 lg:min-h-0 lg:py-0">
				<div class="flex flex-col gap-0.5">
					<Label for="inspector-live-overlays">Live V / I Overlays</Label>
					<span class="text-[11px] text-muted-foreground">Show node &amp; branch badges</span>
				</div>
				<Switch
					id="inspector-live-overlays"
					checked={settings.showLiveOverlays}
					onCheckedChange={(checked) => (settings.showLiveOverlays = checked)}
				/>
			</div>
		</div>
	{/if}
</div>
