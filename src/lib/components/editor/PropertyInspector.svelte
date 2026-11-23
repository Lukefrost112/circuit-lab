<script lang="ts">
	import {
		ArrowLeftRight,
		Cable,
		Eraser,
		Link2,
		RotateCw,
		Target,
		Trash2,
		Unlink,
		X
	} from 'lucide-svelte';
	import { CircuitSymbol } from '$lib/components/symbols';
	import { formatComplexParts } from '$lib/components/results/formatters';
	import { Button, Input, Label, Select, Switch } from '$lib/components/ui';
	import {
		areUnknownKindsCompatible,
		formatEngineering,
		formatUnknownTermExpr,
		getDefaultUnknownSymbol,
		getUnknownTerms,
		isImpedanceSpecified,
		parseDirectImpedance,
		parseEngineeringNumber,
		type ComponentKind,
		type ConstraintKind,
		type PassiveValueMode
	} from '$lib/engine';
	import { AC_ENABLED } from '$lib/env';
	import { circuit } from '$lib/stores/circuit.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import EditableTitle from './EditableTitle.svelte';
	import EngineeringInput from './EngineeringInput.svelte';
	import ImpedanceInput from './ImpedanceInput.svelte';
	import PhasorInput from './PhasorInput.svelte';
	import { computeWireCrossings } from './helpers';

	interface Props {
		onAutoWire?: () => void;
	}

	let { onAutoWire }: Props = $props();

	const KIND_LABELS: Record<ComponentKind, string> = {
		resistor: 'Resistor',
		capacitor: 'Capacitor',
		inductor: 'Inductor',
		voltage_source: 'Voltage Source',
		current_source: 'Current Source',
		ground: 'Ground (0 V)',
		terminal: 'Port Terminal',
		voltmeter: 'Voltmeter'
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
	let sourceFreqDraft = $state('');
	let globalFreqDraft = $state(String(circuit.document.frequencyHz));
	let unknownSymbolDraft = $state('');
	let selectedMultiplierDraft = $state('1');
	let linkSelectValue = $state('');

	$effect(() => {
		if (selectedComp) {
			labelDraft = selectedComp.label;
			terminalNameDraft = selectedComp.terminalName ?? '';
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
	const isReactive = $derived(
		selectedComp?.kind === 'capacitor' || selectedComp?.kind === 'inductor'
	);
	const isImpedanceMode = $derived(
		Boolean(selectedComp && isReactive && isImpedanceSpecified(selectedComp))
	);
	const isVoltmeter = $derived(selectedComp?.kind === 'voltmeter');
	const isTwoTerminal = $derived(
		selectedComp !== null &&
			selectedComp.kind !== 'ground' &&
			selectedComp.kind !== 'terminal' &&
			selectedComp.kind !== 'voltmeter'
	);
	const isAcMode = $derived(AC_ENABLED && circuit.document.mode === 'ac');
	const isTheveninTarget = $derived(
		selectedComp !== null &&
			circuit.theveninTarget?.kind === 'component' &&
			circuit.theveninTarget.componentId === selectedComp.id
	);

	const selectedVoltmeterReading = $derived.by(() => {
		if (!selectedComp || selectedComp.kind !== 'voltmeter') return null;
		const [nodeA, nodeB] = circuit.graph.componentNodes[selectedComp.id] ?? [];
		const branch = circuit.solution.mna.valid && !circuit.solution.mna.multiFrequencyHz
			? circuit.solution.mna.branches[selectedComp.id]
			: undefined;
		if (!branch) {
			return {
				connected: false as const,
				nodeA: nodeA || null,
				nodeB: nodeB || null
			};
		}
		const formatted = formatComplexParts(branch.voltage, 'V', circuit.solution.mna.mode, {
			angleDisplay: settings.angleDisplay,
			precision: settings.precision,
			showDcFractions: settings.showDcFractions,
			unitSystem: settings.unitSystem
		});
		return {
			connected: true as const,
			nodeA: branch.nodeA,
			nodeB: branch.nodeB,
			primary: formatted.primary,
			secondary: formatted.secondary
		};
	});

	const activeUnknownProblem = $derived(circuit.document.unknownProblem);
	const activeUnknownTerms = $derived(getUnknownTerms(activeUnknownProblem));
	const selectedUnknownTerm = $derived(
		selectedComp
			? (activeUnknownTerms.find((t) => t.componentId === selectedComp.id) ?? null)
			: null
	);
	const isUnknownComp = $derived(selectedUnknownTerm !== null);
	const primaryUnknownComp = $derived(
		activeUnknownTerms.length > 0
			? (circuit.document.components.find((c) => c.id === activeUnknownTerms[0].componentId) ??
				null)
			: null
	);
	const activeUnknownSymbol = $derived(
		activeUnknownProblem?.symbol?.trim() ||
			(primaryUnknownComp ? getDefaultUnknownSymbol(primaryUnknownComp.kind) : 'X')
	);
	const canLinkToActiveUnknown = $derived(
		Boolean(
			selectedComp &&
				activeUnknownProblem &&
				!isUnknownComp &&
				primaryUnknownComp &&
				areUnknownKindsCompatible(primaryUnknownComp.kind, selectedComp.kind)
		)
	);

	$effect(() => {
		if (selectedComp && isUnknownComp && activeUnknownProblem) {
			unknownSymbolDraft =
				activeUnknownProblem.symbol ?? getDefaultUnknownSymbol(selectedComp.kind);
			selectedMultiplierDraft = String(selectedUnknownTerm?.multiplier ?? 1);
		} else if (selectedComp) {
			unknownSymbolDraft = getDefaultUnknownSymbol(selectedComp.kind);
			selectedMultiplierDraft = '1';
		}
	});

	const CONSTRAINT_KIND_OPTIONS: Array<{ value: ConstraintKind; label: string }> = [
		{ value: 'branch_current', label: 'Branch Current (I)' },
		{ value: 'branch_voltage', label: 'Branch Voltage (V)' },
		{ value: 'node_voltage', label: 'Node Voltage (V)' },
		{ value: 'branch_power', label: 'Branch Power (P)' }
	];

	const twoTerminalComponents = $derived(
		circuit.document.components.filter(
			(c) => c.kind !== 'ground' && c.kind !== 'terminal' && c.kind !== 'voltmeter'
		)
	);

	const connectedVoltmeters = $derived(
		circuit.document.components.filter((c) => {
			if (c.kind !== 'voltmeter') return false;
			const [nA, nB] = circuit.graph.componentNodes[c.id] ?? [];
			return Boolean(nA && nB && circuit.graph.nodes[nA] && circuit.graph.nodes[nB]);
		})
	);

	const constraintTargetOptions = $derived.by(() => {
		if (!activeUnknownProblem) return [];
		if (activeUnknownProblem.constraint.kind === 'node_voltage') {
			return circuit.graph.nonRefNodeIds.map((nid) => ({
				value: nid,
				label: `Node ${nid}`
			}));
		}
		const base = twoTerminalComponents.map((c) => ({
			value: c.id,
			label: `${c.label} (${KIND_LABELS[c.kind]})`
		}));
		if (activeUnknownProblem.constraint.kind === 'branch_voltage') {
			return [
				...base,
				...connectedVoltmeters.map((vm) => ({
					value: vm.id,
					label: `${vm.label} (${KIND_LABELS[vm.kind]})`
				}))
			];
		}
		return base;
	});

	const constraintUnit = $derived.by(() => {
		const k = activeUnknownProblem?.constraint.kind;
		if (k === 'branch_current') return 'A';
		if (k === 'branch_power') return 'W';
		return 'V';
	});

	function formatBaselineConstraintValue(kind: ConstraintKind, targetId: string): string {
		const mna = circuit.solution.mna;
		if (!mna.valid) {
			return kind === 'branch_current' ? '1m' : kind === 'branch_power' ? '10m' : '5';
		}
		if (kind === 'node_voltage') {
			const v = mna.nodeVoltages[targetId]?.voltage;
			if (!v) return '5';
			if (circuit.document.mode === 'dc' || v.isReal(1e-12)) {
				return formatEngineering(v.re, '', 4);
			}
			const magStr = formatEngineering(v.abs(), '', 4);
			const degStr = Number(v.argDeg().toPrecision(4)).toString();
			return `${magStr}∠${degStr}°`;
		}
		const br = mna.branches[targetId];
		if (!br) return kind === 'branch_current' ? '1m' : kind === 'branch_power' ? '10m' : '5';
		if (kind === 'branch_power') {
			return formatEngineering(br.realPower, '', 4);
		}
		const cVal = kind === 'branch_current' ? br.current : br.voltage;
		if (circuit.document.mode === 'dc' || cVal.isReal(1e-12)) {
			return formatEngineering(cVal.re, '', 4);
		}
		const magStr = formatEngineering(cVal.abs(), '', 4);
		const degStr = Number(cVal.argDeg().toPrecision(4)).toString();
		return `${magStr}∠${degStr}°`;
	}

	function pickDefaultTargetForKind(kind: ConstraintKind, unknownCompId: string): string {
		if (kind === 'node_voltage') {
			return circuit.graph.nonRefNodeIds[0] ?? 'N1';
		}
		const otherResistor = twoTerminalComponents.find(
			(c) => c.id !== unknownCompId && c.kind === 'resistor'
		);
		if (otherResistor) return otherResistor.id;
		const otherBranch = twoTerminalComponents.find((c) => c.id !== unknownCompId);
		if (otherBranch) return otherBranch.id;
		return unknownCompId;
	}

	const linkableCompatibleOptions = $derived.by(() => {
		if (!activeUnknownProblem || !primaryUnknownComp) return [];
		const linkedIds = new Set(activeUnknownTerms.map((t) => t.componentId));
		return twoTerminalComponents
			.filter(
				(c) => !linkedIds.has(c.id) && areUnknownKindsCompatible(primaryUnknownComp.kind, c.kind)
			)
			.map((c) => ({
				value: c.id,
				label: `${c.label} (${KIND_LABELS[c.kind]})`
			}));
	});

	const selectedTermExprPreview = $derived.by(() => {
		const raw = String(selectedMultiplierDraft ?? '').trim();
		const num = raw === '' ? Number.NaN : Number(raw);
		const mult =
			Number.isFinite(num) && Math.abs(num) > 1e-15
				? num
				: (selectedUnknownTerm?.multiplier ?? 1);
		return formatUnknownTermExpr(mult, unknownSymbolDraft.trim() || activeUnknownSymbol);
	});

	function handleToggleUnknown(checked: boolean) {
		if (!selectedComp || !isTwoTerminal) return;
		if (!checked) {
			if (isUnknownComp) {
				circuit.unlinkComponentFromUnknown(selectedComp.id);
			}
			return;
		}
		if (canLinkToActiveUnknown) {
			circuit.linkComponentToUnknown(selectedComp.id, 1);
			return;
		}
		const defaultKind: ConstraintKind = 'branch_current';
		const defaultTargetId = pickDefaultTargetForKind(defaultKind, selectedComp.id);
		const defaultValue = formatBaselineConstraintValue(defaultKind, defaultTargetId);
		const defaultSym = getDefaultUnknownSymbol(selectedComp.kind);
		circuit.setUnknownProblem({
			componentId: selectedComp.id,
			symbol: defaultSym,
			terms: [{ componentId: selectedComp.id, multiplier: 1 }],
			constraint: {
				kind: defaultKind,
				targetId: defaultTargetId,
				value: defaultValue
			}
		});
	}

	function commitSelectedMultiplier() {
		if (!selectedComp || !selectedUnknownTerm) return;
		const raw = String(selectedMultiplierDraft ?? '').trim();
		const parsed = raw === '' ? Number.NaN : Number(raw);
		if (!Number.isFinite(parsed) || Math.abs(parsed) <= 1e-15 || (isPassive && parsed <= 0)) {
			selectedMultiplierDraft = String(selectedUnknownTerm.multiplier);
			return;
		}
		circuit.setUnknownTermMultiplier(selectedComp.id, parsed);
	}

	function handleInlineTermMultiplierCommit(compId: string, kind: ComponentKind, rawVal: string, inputEl: HTMLInputElement) {
		const raw = String(rawVal ?? '').trim();
		const parsed = raw === '' ? Number.NaN : Number(raw);
		const isPassiveTerm = kind === 'resistor' || kind === 'capacitor' || kind === 'inductor';
		const current = activeUnknownTerms.find((t) => t.componentId === compId);
		if (!Number.isFinite(parsed) || Math.abs(parsed) <= 1e-15 || (isPassiveTerm && parsed <= 0)) {
			inputEl.value = String(current?.multiplier ?? 1);
			return;
		}
		circuit.setUnknownTermMultiplier(compId, parsed);
	}

	function handleLinkCompatibleSelect(targetId: string) {
		if (!targetId) return;
		circuit.linkComponentToUnknown(targetId, 1);
		linkSelectValue = '';
	}

	function commitUnknownSymbol() {
		if (!selectedComp || !isUnknownComp || !activeUnknownProblem) return;
		const trimmed = unknownSymbolDraft.trim() || getDefaultUnknownSymbol(selectedComp.kind);
		unknownSymbolDraft = trimmed;
		if (trimmed !== (activeUnknownProblem.symbol ?? getDefaultUnknownSymbol(selectedComp.kind))) {
			circuit.setUnknownProblem({
				...activeUnknownProblem,
				symbol: trimmed
			});
		}
	}

	function handleConstraintKindChange(nextKind: ConstraintKind) {
		if (!selectedComp || !isUnknownComp || !activeUnknownProblem) return;
		const prevKind = activeUnknownProblem.constraint.kind;
		if (nextKind === prevKind) return;

		const isPrevNode = prevKind === 'node_voltage';
		const isNextNode = nextKind === 'node_voltage';
		const currentTargetComp = circuit.document.components.find(
			(c) => c.id === activeUnknownProblem.constraint.targetId
		);
		const invalidVoltmeterForKind =
			currentTargetComp?.kind === 'voltmeter' && nextKind !== 'branch_voltage';
		const nextTargetId =
			isPrevNode === isNextNode && !invalidVoltmeterForKind
				? activeUnknownProblem.constraint.targetId
				: pickDefaultTargetForKind(nextKind, selectedComp.id);

		const nextValue = formatBaselineConstraintValue(nextKind, nextTargetId);
		circuit.setUnknownProblem({
			...activeUnknownProblem,
			constraint: {
				...activeUnknownProblem.constraint,
				kind: nextKind,
				targetId: nextTargetId,
				value: nextValue
			}
		});
	}

	function handleConstraintTargetChange(nextTargetId: string) {
		if (!isUnknownComp || !activeUnknownProblem || !nextTargetId) return;
		if (nextTargetId === activeUnknownProblem.constraint.targetId) return;
		const nextValue = formatBaselineConstraintValue(
			activeUnknownProblem.constraint.kind,
			nextTargetId
		);
		circuit.setUnknownProblem({
			...activeUnknownProblem,
			constraint: {
				...activeUnknownProblem.constraint,
				targetId: nextTargetId,
				value: nextValue
			}
		});
	}

	function handleConstraintValueCommit(nextValue: string) {
		if (!isUnknownComp || !activeUnknownProblem) return;
		if (nextValue === activeUnknownProblem.constraint.value) return;
		circuit.setUnknownProblem({
			...activeUnknownProblem,
			constraint: {
				...activeUnknownProblem.constraint,
				value: nextValue
			}
		});
	}

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

	const selectedWireCrossings = $derived.by(() => {
		if (!selectedWire) return [];
		return computeWireCrossings(circuit.document.components, circuit.document.wires).filter((c) =>
			c.wireIds.includes(selectedWire.id)
		);
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

	function handlePassiveModeChange(nextMode: PassiveValueMode) {
		if (!selectedComp || (selectedComp.kind !== 'inductor' && selectedComp.kind !== 'capacitor')) {
			return;
		}
		const currentlyImpedance = isImpedanceSpecified(selectedComp);
		if ((nextMode === 'impedance') === currentlyImpedance) {
			return;
		}
		const omega = 2 * Math.PI * circuit.document.frequencyHz;

		if (nextMode === 'impedance') {
			const physVal = parseEngineeringNumber(selectedComp.value);
			let converted: string;
			if (selectedComp.kind === 'inductor') {
				if (physVal !== null && physVal > 0 && Number.isFinite(omega) && omega > 0) {
					const xl = omega * physVal;
					converted = `j${formatEngineering(xl, '', 4).replace(/\s+/g, '')}`;
				} else {
					converted = 'j1';
				}
			} else {
				if (physVal !== null && physVal > 0 && Number.isFinite(omega) && omega > 0) {
					const xc = 1 / (omega * physVal);
					converted = `-j${formatEngineering(xc, '', 4).replace(/\s+/g, '')}`;
				} else {
					converted = '-j1';
				}
			}
			circuit.updateComponent(selectedComp.id, {
				valueMode: 'impedance',
				unit: 'Ω',
				value: converted
			});
			return;
		}

		// Impedance -> Physical
		const z = parseDirectImpedance(selectedComp);
		let converted: string;
		if (selectedComp.kind === 'inductor') {
			if (z && Math.abs(z.re) < 1e-12 && z.im > 0 && Number.isFinite(omega) && omega > 0) {
				const l = z.im / omega;
				converted = formatEngineering(l, '', 4).replace(/\s+/g, '');
			} else {
				converted = '10m';
			}
			circuit.updateComponent(selectedComp.id, {
				valueMode: 'physical',
				unit: 'H',
				value: converted
			});
		} else {
			if (z && Math.abs(z.re) < 1e-12 && z.im < 0 && Number.isFinite(omega) && omega > 0) {
				const c = 1 / (omega * Math.abs(z.im));
				converted = formatEngineering(c, '', 4).replace(/\s+/g, '');
			} else {
				converted = '10u';
			}
			circuit.updateComponent(selectedComp.id, {
				valueMode: 'physical',
				unit: 'F',
				value: converted
			});
		}
	}

	function commitSourceFrequency() {
		if (!AC_ENABLED || !selectedComp || !isSource) return;
		const trimmed = String(sourceFreqDraft ?? '').trim();
		if (trimmed === '') {
			sourceFreqDraft = '';
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
		if (!AC_ENABLED) return;
		const trimmed = String(globalFreqDraft ?? '').trim();
		const hz = trimmed === '' ? Number.NaN : Number(trimmed);
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
	<!-- Circuit name (header shows the inline rename control at xl+) -->
	<div class="flex flex-col gap-1.5 px-4 py-3 xl:hidden">
		<span class="text-[11px] font-medium text-muted-foreground">Circuit name</span>
		<EditableTitle
			variant="panel"
			inputId="inspector-circuit-name"
			value={circuit.document.name ?? ''}
			onCommit={(next) => circuit.setDocumentName(next)}
		/>
	</div>
	{#if selectedComp}
		<!-- Component Identity Header -->
		<div class="flex items-center justify-between gap-2 px-4 py-3.5">
			<div class="flex min-w-0 items-center gap-2.5">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-border bg-surface-rail text-foreground">
					<CircuitSymbol
						kind={selectedComp.kind}
						variant="icon"
						sourceMode={AC_ENABLED && (isAcMode || /[∠@<j]/i.test(selectedComp.value)) ? 'ac' : 'dc'}
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
			{:else if selectedComp.kind === 'voltmeter' && selectedVoltmeterReading}
				<div
					class="flex flex-col gap-1.5 rounded-[4px] border border-border bg-surface-rail/50 px-3 py-2.5"
				>
					<div class="flex items-baseline justify-between gap-2">
						<span class="text-[11px] font-medium text-muted-foreground">
							Measured Voltage (V<sub>+</sub> − V<sub>−</sub>)
						</span>
						{#if selectedVoltmeterReading.connected}
							<span class="font-engineering text-[10px] text-muted-foreground">
								{selectedVoltmeterReading.nodeA === '0' ? 'GND' : selectedVoltmeterReading.nodeA} (+)
								→ {selectedVoltmeterReading.nodeB === '0'
									? 'GND'
									: selectedVoltmeterReading.nodeB} (−)
							</span>
						{/if}
					</div>
					{#if selectedVoltmeterReading.connected}
						<div class="font-engineering text-base font-semibold text-voltage">
							{selectedVoltmeterReading.primary}
						</div>
						{#if selectedVoltmeterReading.secondary}
							<div class="font-engineering text-xs text-muted-foreground">
								{selectedVoltmeterReading.secondary}
							</div>
						{/if}
						<p class="text-[11px] leading-snug text-muted-foreground">
							Ideal open-circuit probe (I = 0 A, P = 0 W)
						</p>
					{:else}
						<div class="font-engineering text-sm font-medium text-muted-foreground">Open</div>
						<p class="text-[11px] leading-snug text-muted-foreground">
							Connect both + and − probes to circuit nodes to read differential voltage.
						</p>
					{/if}
				</div>
			{:else if selectedComp.kind !== 'ground'}
				{#if isReactive && isAcMode}
					<div class="flex flex-col gap-1.5">
						<span class="text-[11px] font-medium text-muted-foreground">
							Value Specification
						</span>
						<div
							role="radiogroup"
							aria-label={selectedComp.kind === 'inductor'
								? 'Inductor value specification'
								: 'Capacitor value specification'}
							class="grid h-auto min-h-11 grid-cols-2 gap-0.5 rounded-[4px] border border-border bg-surface-rail p-0.5 lg:h-8 lg:min-h-0"
						>
							<button
								type="button"
								role="radio"
								aria-checked={!isImpedanceMode}
								onclick={() => handlePassiveModeChange('physical')}
								class={`min-h-11 cursor-pointer rounded-[3px] border px-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-full lg:min-h-0 lg:text-[11px] ${
									!isImpedanceMode
										? 'border-border bg-card text-foreground'
										: 'border-transparent text-muted-foreground hover:text-foreground'
								}`}
							>
								{selectedComp.kind === 'inductor' ? 'Inductance (H)' : 'Capacitance (F)'}
							</button>
							<button
								type="button"
								role="radio"
								aria-checked={isImpedanceMode}
								onclick={() => handlePassiveModeChange('impedance')}
								class={`min-h-11 cursor-pointer rounded-[3px] border px-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-full lg:min-h-0 lg:text-[11px] ${
									isImpedanceMode
										? 'border-border bg-card text-foreground'
										: 'border-transparent text-muted-foreground hover:text-foreground'
								}`}
							>
								Impedance (Ω)
							</button>
						</div>
					</div>
				{/if}

				{#if isReactive && isImpedanceMode}
					<ImpedanceInput
						kind={selectedComp.kind === 'inductor' ? 'inductor' : 'capacitor'}
						value={selectedComp.value}
						{isAcMode}
						disabled={isUnknownComp}
						idPrefix="comp-impedance"
						onCommit={(val) =>
							circuit.updateComponent(selectedComp.id, {
								valueMode: 'impedance',
								unit: 'Ω',
								value: val
							})}
					/>
				{:else if isSource && isAcMode}
					<PhasorInput
						idPrefix="comp-phasor"
						label="AC Phasor"
						value={selectedComp.value}
						phaseDeg={selectedComp.phaseDeg}
						unit={selectedComp.unit ?? UNIT_BY_KIND[selectedComp.kind] ?? ''}
						disabled={isUnknownComp}
						onCommit={({ value, phaseDeg }) =>
							circuit.updateComponent(selectedComp.id, { value, phaseDeg })}
					/>
				{:else}
					<div class="flex flex-col gap-1.5">
						<Label for="comp-value">
							{isSource ? 'DC Value' : 'Value'}
						</Label>
						<EngineeringInput
							id="comp-value"
							value={selectedComp.value}
							unit={selectedComp.unit ?? UNIT_BY_KIND[selectedComp.kind] ?? ''}
							allowComplex={false}
							positiveOnly={isPassive}
							allowZero={isSource}
							onCommit={(val) => circuit.updateComponent(selectedComp.id, { value: val })}
						/>
					</div>
				{/if}
			{/if}

			{#if isSource && isAcMode}
				<div class="flex flex-col gap-1.5">
					<Label for="comp-freq">Source Freq (Hz)</Label>
					<Input
						id="comp-freq"
						type="number"
						inputmode="decimal"
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
					<p class="text-[11px] leading-snug text-muted-foreground">
						Optional per-source frequency enables multi-frequency AC Superposition.
					</p>
				</div>
			{/if}
		</div>

		<!-- Solve for Unknown (?) Section -->
		{#if isTwoTerminal}
			<div class="flex flex-col gap-3 px-4 py-3.5">
				<div class="flex min-h-11 items-center justify-between gap-2 py-0.5 lg:min-h-0 lg:py-0">
					<div class="flex flex-col gap-0.5">
						<Label for="comp-unknown-toggle">
							{#if isUnknownComp}
								Unknown Parameter ({activeUnknownSymbol})
							{:else if canLinkToActiveUnknown}
								Link to Unknown {activeUnknownSymbol}
							{:else}
								Solve for Unknown (?)
							{/if}
						</Label>
						<span class="text-[11px] text-muted-foreground">
							{#if isUnknownComp}
								Assigned {selectedComp.label} = {selectedTermExprPreview}
							{:else if canLinkToActiveUnknown}
								Link {selectedComp.label} as a scaled multiple of {activeUnknownSymbol}
							{:else}
								Mark value as Unknown (?)
							{/if}
						</span>
					</div>
					<Switch
						id="comp-unknown-toggle"
						aria-label={isUnknownComp
							? `Unknown Parameter (${activeUnknownSymbol})`
							: canLinkToActiveUnknown
								? `Link to Unknown ${activeUnknownSymbol}`
								: 'Mark value as Unknown (?)'}
						checked={isUnknownComp}
						onCheckedChange={handleToggleUnknown}
					/>
				</div>

				{#if isUnknownComp && activeUnknownProblem && selectedUnknownTerm}
					<div class="flex flex-col gap-2.5 border-t border-border pt-3">
						<div class="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
							<div class="flex flex-col gap-1.5">
								<Label for="unknown-symbol">Unknown Symbol</Label>
								<Input
									id="unknown-symbol"
									tabular
									placeholder="e.g. V, Vs, Rx"
									bind:value={unknownSymbolDraft}
									onblur={commitUnknownSymbol}
									onkeydown={(e) => {
										if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
									}}
								/>
							</div>

							<div class="flex flex-col gap-1.5">
								<div class="flex items-baseline justify-between gap-1">
									<Label for="unknown-multiplier">Scale / Multiplier</Label>
									<span class="font-engineering text-[11px] font-semibold text-warning">
										= {selectedTermExprPreview}
									</span>
								</div>
								<Input
									id="unknown-multiplier"
									type="number"
									inputmode="decimal"
									step="any"
									min={isPassive ? '0.000001' : undefined}
									tabular
									placeholder="e.g. 1, 2, 0.5"
									class="min-h-11 text-base lg:min-h-0 lg:text-xs"
									bind:value={selectedMultiplierDraft}
									onblur={commitSelectedMultiplier}
									onkeydown={(e) => {
										if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
									}}
								/>
							</div>
						</div>

						<!-- Linked Elements List -->
						<div class="flex flex-col gap-1.5 border-t border-border pt-2.5">
							<div class="flex items-center justify-between gap-2">
								<span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Linked Elements ({activeUnknownTerms.length})
								</span>
							</div>

							<div class="flex flex-col divide-y divide-border rounded-[4px] border border-border bg-surface-rail/40">
								{#each activeUnknownTerms as term (term.componentId)}
									{@const termComp = circuit.document.components.find(
										(c) => c.id === term.componentId
									)}
									{#if termComp}
										{@const termExpr = formatUnknownTermExpr(
											term.multiplier,
											activeUnknownSymbol
										)}
										<div class="flex items-center justify-between gap-2 px-2.5 py-1.5">
											<div class="flex min-w-0 items-baseline gap-1.5 font-engineering text-xs">
												<span class="font-semibold text-foreground">{termComp.label}</span>
												<span class="text-muted-foreground">=</span>
												<span class="font-semibold text-warning">{termExpr}</span>
											</div>

											<div class="flex shrink-0 items-center gap-1.5">
												<input
													type="number"
													inputmode="decimal"
													step="any"
													min={termComp.kind === 'resistor' ||
													termComp.kind === 'capacitor' ||
													termComp.kind === 'inductor'
														? '0.000001'
														: undefined}
													aria-label="Scale multiplier for {termComp.label}"
													value={term.multiplier}
													class="font-engineering h-11 min-h-11 w-20 rounded-[4px] border border-input bg-card px-2 text-right text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-6 lg:min-h-0 lg:w-14 lg:px-1.5 lg:text-xs"
													onblur={(e) =>
														handleInlineTermMultiplierCommit(
															term.componentId,
															termComp.kind,
															e.currentTarget.value,
															e.currentTarget
														)}
													onkeydown={(e) => {
														if (e.key === 'Enter') e.currentTarget.blur();
													}}
												/>
												<button
													type="button"
													aria-label="Unlink {termComp.label} from {activeUnknownSymbol}"
													title="Unlink {termComp.label}"
													class="inline-flex h-11 w-11 min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-6 lg:w-6 lg:min-h-0 lg:min-w-0"
													onclick={() =>
														circuit.unlinkComponentFromUnknown(term.componentId)}
												>
													<X class="size-3.5" aria-hidden="true" />
												</button>
											</div>
										</div>
									{/if}
								{/each}
							</div>

							{#if linkableCompatibleOptions.length > 0}
								<Select
									id="unknown-link-compatible"
									aria-label="Link another compatible element"
									value={linkSelectValue}
									options={[
										{ value: '', label: '+ Link another compatible element…' },
										...linkableCompatibleOptions
									]}
									onchange={(e) => {
										const val = (e.currentTarget as HTMLSelectElement).value;
										handleLinkCompatibleSelect(val);
									}}
								/>
							{/if}
						</div>

						<div class="flex flex-col gap-1.5 border-t border-border pt-2.5">
							<Label for="unknown-constraint-kind">Given Measurement</Label>
							<Select
								id="unknown-constraint-kind"
								value={activeUnknownProblem.constraint.kind}
								options={CONSTRAINT_KIND_OPTIONS}
								onchange={(e) => {
									const val = (e.currentTarget as HTMLSelectElement).value as ConstraintKind;
									handleConstraintKindChange(val);
								}}
							/>
						</div>

						<div class="flex flex-col gap-1.5">
							<Label for="unknown-constraint-target">
								{activeUnknownProblem.constraint.kind === 'node_voltage'
									? 'Measured Node'
									: 'Measured Element'}
							</Label>
							<Select
								id="unknown-constraint-target"
								value={activeUnknownProblem.constraint.targetId}
								options={constraintTargetOptions}
								onchange={(e) => {
									const val = (e.currentTarget as HTMLSelectElement).value;
									handleConstraintTargetChange(val);
								}}
							/>
						</div>

						{#if isAcMode && activeUnknownProblem.constraint.kind !== 'branch_power'}
							<PhasorInput
								idPrefix="unknown-target-phasor"
								label="Target Value"
								value={activeUnknownProblem.constraint.value}
								unit={constraintUnit}
								onCommit={({ value }) => handleConstraintValueCommit(value)}
							/>
						{:else}
							<div class="flex flex-col gap-1.5">
								<Label for="unknown-constraint-value">Target Value</Label>
								<EngineeringInput
									id="unknown-constraint-value"
									value={activeUnknownProblem.constraint.value}
									unit={constraintUnit}
									allowComplex={false}
									positiveOnly={false}
									allowZero={true}
									onCommit={handleConstraintValueCommit}
								/>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

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

			{#if isVoltmeter}
				<Button
					variant="outline"
					size="sm"
					class="min-h-11 w-full lg:h-8 lg:min-h-0"
					onclick={() => circuit.flipComponentPolarity(selectedComp.id)}
				>
					<ArrowLeftRight class="size-3.5" aria-hidden="true" />
					<span>Flip Polarity (±)</span>
				</Button>
			{/if}

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

		{#if selectedWireCrossings.length > 0}
			<!-- Wire Crossings -->
			<div class="flex flex-col gap-2.5 px-4 py-3.5">
				<div class="flex items-center justify-between gap-2">
					<h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Wire Crossings
					</h3>
					<span class="font-engineering text-[11px] text-muted-foreground">
						{selectedWireCrossings.length}
					</span>
				</div>
				<div class="flex flex-col divide-y divide-border rounded-[4px] border border-border bg-surface-rail/40">
					{#each selectedWireCrossings as crossing (`${crossing.x},${crossing.y}`)}
						<div class="flex flex-col gap-2 px-2.5 py-2">
							<div class="flex items-center justify-between gap-2 text-xs">
								<span class="font-engineering font-medium text-foreground">
									({crossing.x}, {crossing.y})
								</span>
								<span
									class={crossing.connected
										? 'font-engineering text-[11px] font-medium text-voltage'
										: 'font-engineering text-[11px] text-muted-foreground'}
								>
									{crossing.connected ? 'Connected (Junction)' : 'Unconnected (Bridge)'}
								</span>
							</div>
							<Button
								variant="outline"
								size="sm"
								class="min-h-11 w-full lg:h-7 lg:min-h-0"
								onclick={() => circuit.toggleWireCrossing(crossing.x, crossing.y)}
							>
								{#if crossing.connected}
									<Unlink class="size-3.5" aria-hidden="true" />
									<span>Disconnect (Bridge)</span>
								{:else}
									<Link2 class="size-3.5" aria-hidden="true" />
									<span>Connect (Junction)</span>
								{/if}
							</Button>
						</div>
					{/each}
				</div>
			</div>
		{/if}

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
						inputmode="decimal"
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

			<div class="flex flex-col gap-1.5">
				<Label for="inspector-unit-system">Unit System</Label>
				<Select
					id="inspector-unit-system"
					value={settings.unitSystem}
					onchange={(e) => {
						const val = (e.currentTarget as HTMLSelectElement).value;
						if (
							val === 'auto' ||
							val === 'ohm-v-a' ||
							val === 'kohm-v-ma' ||
							val === 'mohm-v-ua'
						) {
							settings.unitSystem = val;
						}
					}}
					options={[
						{ value: 'auto', label: 'Auto SI (Best-fit Prefixes)' },
						{ value: 'ohm-v-a', label: 'Ω · V · A · W (Base SI)' },
						{ value: 'kohm-v-ma', label: 'kΩ · V · mA · mW (Electronics)' },
						{ value: 'mohm-v-ua', label: 'MΩ · V · µA · µW (High-Z)' }
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

		{#if circuit.document.components.length > 0 || circuit.document.wires.length > 0}
			<!-- Mobile Workspace Actions (< lg) -->
			<div class="flex flex-col gap-2 px-4 py-3.5 lg:hidden">
				<Button
					variant="outline"
					size="sm"
					class="min-h-11 w-full"
					disabled={circuit.document.components.length < 2}
					onclick={() => (onAutoWire ? onAutoWire() : circuit.autoWireCircuit())}
				>
					<Cable class="size-3.5" aria-hidden="true" />
					<span>Auto-Wire Circuit</span>
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="min-h-11 w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
					onclick={() => circuit.clearCircuit()}
				>
					<Eraser class="size-3.5" aria-hidden="true" />
					<span>Clear Canvas</span>
				</Button>
			</div>
		{/if}
	{/if}
</div>
