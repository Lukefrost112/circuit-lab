<script lang="ts">
	import { RotateCw, Target, Trash2 } from 'lucide-svelte';
	import { CircuitSymbol } from '$lib/components/symbols';
	import { Badge, Button, Input, Label, Select, Separator, Switch } from '$lib/components/ui';
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

<div class="flex flex-col gap-3">
	{#if selectedComp}
		<!-- Component Header -->
		<div class="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-3">
			<div class="flex min-w-0 items-center gap-2.5">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-rail text-foreground">
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
					<Badge variant="outline" class="mt-0.5">
						{KIND_LABELS[selectedComp.kind]}
					</Badge>
				</div>
			</div>
			<span class="font-engineering text-[11px] text-muted-foreground">
				({selectedComp.x}, {selectedComp.y}) · {selectedComp.rotation}°
			</span>
		</div>

		<!-- Component Properties -->
		<div class="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
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
				<div class="grid grid-cols-2 gap-2">
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

			<Separator />

			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					class="flex-1"
					onclick={() => circuit.rotateComponent(selectedComp.id)}
				>
					<RotateCw class="size-3.5" />
					<span>Rotate 90°</span>
				</Button>
				<Button
					variant="destructive"
					size="sm"
					onclick={() => circuit.deleteComponent(selectedComp.id)}
				>
					<Trash2 class="size-3.5" />
					<span>Delete</span>
				</Button>
			</div>

			{#if isTwoTerminal}
				<Button
					variant={isTheveninTarget ? 'default' : 'secondary'}
					size="sm"
					class="w-full"
					onclick={toggleThevenin}
				>
					<Target class="size-3.5" />
					<span>
						{isTheveninTarget
							? 'Clear Thévenin / Norton Target'
							: 'Analyze Thévenin / Norton Across Element'}
					</span>
				</Button>
			{/if}
		</div>
	{:else if selectedWire}
		<!-- Wire Properties -->
		<div class="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
			<div class="flex items-center justify-between">
				<h2 class="text-xs font-semibold text-foreground">Selected Wire</h2>
				<Badge variant="outline" class="font-engineering">{selectedWire.id}</Badge>
			</div>

			<div class="flex flex-col gap-1.5 text-xs">
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
				<div class="rounded border border-border bg-surface-rail px-2 py-1.5 font-engineering text-[11px] text-muted-foreground">
					{selectedWire.points.map((p) => `(${p.x},${p.y})`).join(' → ')}
				</div>
			</div>

			<Button
				variant="destructive"
				size="sm"
				class="w-full"
				onclick={() => circuit.deleteWire(selectedWire.id)}
			>
				<Trash2 class="size-3.5" />
				<span>Delete Wire</span>
			</Button>
		</div>
	{:else}
		<!-- Empty Selection & Simulation Parameters -->
		<div class="rounded-md border border-border bg-card p-3">
			<h2 class="text-xs font-semibold text-foreground">No Element Selected</h2>
			<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
				Click any component or wire on the schematic canvas to edit values, rotate, or set a
				Thévenin load port. Click any pin circle to draw an orthogonal wire.
			</p>
		</div>

		<div class="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
			<h3 class="text-xs font-semibold text-foreground">Simulation Parameters</h3>

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

			<Separator />

			<div class="flex items-center justify-between gap-2">
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

			<div class="flex items-center justify-between gap-2">
				<div class="flex flex-col gap-0.5">
					<Label for="inspector-show-grid">Show Grid</Label>
					<span class="text-[11px] text-muted-foreground">20 px dots & major lines</span>
				</div>
				<Switch
					id="inspector-show-grid"
					checked={settings.showGrid}
					onCheckedChange={(checked) => (settings.showGrid = checked)}
				/>
			</div>

			<div class="flex items-center justify-between gap-2">
				<div class="flex flex-col gap-0.5">
					<Label for="inspector-live-overlays">Live V / I Overlays</Label>
					<span class="text-[11px] text-muted-foreground">Show node & branch badges</span>
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
