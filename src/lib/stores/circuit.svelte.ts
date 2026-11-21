/**
 * Reactive Svelte 5 rune store managing the active CircuitDocument, selection,
 * active editor tool, placement rotation, undo/redo history, Thévenin target,
 * and derived electrical graph + full cross-verified solver results.
 */

import { PRESETS, getPresetById } from '$lib/data/presets';
import {
	buildElectricalGraph,
	parseEngineeringNumber,
	solveCircuit,
	type AnalysisMode,
	type CircuitComponent,
	type CircuitDocument,
	type CircuitWire,
	type ComponentKind,
	type ElectricalGraph,
	type FullSolveResult,
	type GridPoint,
	type MethodId,
	type Rotation,
	type TheveninTarget
} from '$lib/engine';
import type { SourceMode } from '$lib/components/symbols';
import { settings } from './settings.svelte';

export type EditorTool = 'select' | 'wire' | 'probe' | ComponentKind;

export interface AddComponentOptions {
	rotation?: Rotation;
	value?: string;
	label?: string;
	sourceMode?: SourceMode;
	phaseDeg?: number;
	frequencyHz?: number;
	unit?: string;
	terminalName?: string;
}

export interface HistorySnapshot {
	document: CircuitDocument;
	theveninTarget?: TheveninTarget;
}

const MAX_HISTORY = 50;

const DEFAULT_UNITS: Record<ComponentKind, string | undefined> = {
	resistor: 'Ω',
	capacitor: 'F',
	inductor: 'H',
	voltage_source: 'V',
	current_source: 'A',
	ground: undefined,
	terminal: undefined
};

const LABEL_PREFIXES: Record<ComponentKind, string> = {
	resistor: 'R',
	capacitor: 'C',
	inductor: 'L',
	voltage_source: 'V',
	current_source: 'I',
	ground: 'GND',
	terminal: 'T'
};

function cloneDocument(doc: CircuitDocument): CircuitDocument {
	return {
		schemaVersion: 1,
		id: doc.id,
		name: doc.name,
		mode: doc.mode,
		frequencyHz: doc.frequencyHz,
		acMagnitudeMode: doc.acMagnitudeMode,
		components: doc.components.map((c) => ({
			...c,
			controlRef: c.controlRef ? { ...c.controlRef } : undefined
		})),
		wires: doc.wires.map((w) => ({
			id: w.id,
			points: w.points.map((p) => ({ x: p.x, y: p.y }))
		}))
	};
}

function cloneTheveninTarget(target?: TheveninTarget): TheveninTarget | undefined {
	if (!target) return undefined;
	return { ...target };
}

function normalizeWirePoints(points: GridPoint[]): GridPoint[] {
	const rounded = points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
	const deduped: GridPoint[] = [];
	for (const pt of rounded) {
		const prev = deduped[deduped.length - 1];
		if (!prev || prev.x !== pt.x || prev.y !== pt.y) {
			deduped.push(pt);
		}
	}
	// Remove redundant collinear intermediate points
	if (deduped.length <= 2) return deduped;
	const simplified: GridPoint[] = [deduped[0]];
	for (let i = 1; i < deduped.length - 1; i++) {
		const a = simplified[simplified.length - 1];
		const b = deduped[i];
		const c = deduped[i + 1];
		const sameX = a.x === b.x && b.x === c.x;
		const sameY = a.y === b.y && b.y === c.y;
		if (!sameX && !sameY) {
			simplified.push(b);
		}
	}
	simplified.push(deduped[deduped.length - 1]);
	return simplified;
}

function wiresEqual(a: GridPoint[], b: GridPoint[]): boolean {
	if (a.length !== b.length) return false;
	const forward = a.every((pt, idx) => pt.x === b[idx].x && pt.y === b[idx].y);
	if (forward) return true;
	return a.every((pt, idx) => {
		const rev = b[b.length - 1 - idx];
		return pt.x === rev.x && pt.y === rev.y;
	});
}

function nextUniqueLabel(kind: ComponentKind, components: CircuitComponent[]): { label: string; terminalName?: string } {
	const used = new Set<string>();
	for (const c of components) {
		used.add(c.id);
		used.add(c.label);
	}

	if (kind === 'terminal') {
		const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		for (let i = 0; i < letters.length; i++) {
			const letter = letters[i];
			const candidate = `T${letter}`;
			if (!used.has(candidate)) {
				return { label: candidate, terminalName: letter };
			}
		}
		let idx = 1;
		while (used.has(`T${idx}`)) idx++;
		return { label: `T${idx}`, terminalName: `${idx}` };
	}

	const prefix = LABEL_PREFIXES[kind];
	let idx = 1;
	while (used.has(`${prefix}${idx}`)) {
		idx++;
	}
	return { label: `${prefix}${idx}` };
}

function nextUniqueWireId(wires: CircuitWire[]): string {
	const used = new Set(wires.map((w) => w.id));
	let idx = 1;
	while (used.has(`w${idx}`)) {
		idx++;
	}
	return `w${idx}`;
}

function getDefaultValue(kind: ComponentKind, sourceMode: SourceMode): string {
	switch (kind) {
		case 'resistor':
			return '1k';
		case 'capacitor':
			return '10u';
		case 'inductor':
			return '10m';
		case 'voltage_source':
			return sourceMode === 'ac' ? '10∠0°' : '10';
		case 'current_source':
			return sourceMode === 'ac' ? '10m∠0°' : '10m';
		case 'ground':
		case 'terminal':
			return '0';
	}
}

const initialPreset = PRESETS[0];

class CircuitStore {
	private _document = $state<CircuitDocument>(cloneDocument(initialPreset.document));
	private _selectedComponentId = $state<string | null>(null);
	private _selectedWireId = $state<string | null>(null);
	private _activeTool = $state<EditorTool>('select');
	private _activeSourceMode = $state<SourceMode>(initialPreset.document.mode);
	private _placementRotation = $state<Rotation>(0);
	private _theveninTarget = $state<TheveninTarget | undefined>(
		initialPreset.theveninLoadId
			? { kind: 'component', componentId: initialPreset.theveninLoadId }
			: undefined
	);
	private _activeMethod = $state<MethodId>(initialPreset.featuredMethod ?? 'nodal');

	private _undoStack = $state<HistorySnapshot[]>([]);
	private _redoStack = $state<HistorySnapshot[]>([]);

	private _graph = $derived<ElectricalGraph>(buildElectricalGraph(this._document));
	private _solution = $derived<FullSolveResult>(
		solveCircuit(this._document, {
			frequencyHz: this._document.frequencyHz,
			acMagnitudeMode: settings.acMagnitudeMode,
			theveninTarget: this._theveninTarget
		})
	);
	private _selectedComponent = $derived<CircuitComponent | null>(
		this._selectedComponentId
			? (this._document.components.find((c) => c.id === this._selectedComponentId) ?? null)
			: null
	);
	private _selectedWire = $derived<CircuitWire | null>(
		this._selectedWireId
			? (this._document.wires.find((w) => w.id === this._selectedWireId) ?? null)
			: null
	);

	get document(): CircuitDocument {
		return this._document;
	}

	get selectedComponentId(): string | null {
		return this._selectedComponentId;
	}
	set selectedComponentId(id: string | null) {
		this._selectedComponentId = id;
		if (id !== null) {
			this._selectedWireId = null;
		}
	}

	get selectedWireId(): string | null {
		return this._selectedWireId;
	}
	set selectedWireId(id: string | null) {
		this._selectedWireId = id;
		if (id !== null) {
			this._selectedComponentId = null;
		}
	}

	get selectedComponent(): CircuitComponent | null {
		return this._selectedComponent;
	}

	get selectedWire(): CircuitWire | null {
		return this._selectedWire;
	}

	get activeTool(): EditorTool {
		return this._activeTool;
	}
	set activeTool(tool: EditorTool) {
		this._activeTool = tool;
	}

	get activeSourceMode(): SourceMode {
		return this._activeSourceMode;
	}
	set activeSourceMode(mode: SourceMode) {
		this._activeSourceMode = mode;
	}

	get placementRotation(): Rotation {
		return this._placementRotation;
	}
	set placementRotation(rot: Rotation) {
		this._placementRotation = (((rot % 360) + 360) % 360) as Rotation;
	}

	get theveninTarget(): TheveninTarget | undefined {
		return this._theveninTarget;
	}

	get activeMethod(): MethodId {
		return this._activeMethod;
	}
	set activeMethod(method: MethodId) {
		this._activeMethod = method;
	}

	get canUndo(): boolean {
		return this._undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this._redoStack.length > 0;
	}

	get graph(): ElectricalGraph {
		return this._graph;
	}

	get solution(): FullSolveResult {
		return this._solution;
	}

	/** Captures an undo snapshot of the current document and Thévenin target. */
	recordSnapshot(): void {
		const snapshot: HistorySnapshot = {
			document: cloneDocument(this._document),
			theveninTarget: cloneTheveninTarget(this._theveninTarget)
		};
		const next = [...this._undoStack, snapshot];
		if (next.length > MAX_HISTORY) {
			next.shift();
		}
		this._undoStack = next;
		this._redoStack = [];
	}

	private reconcileSelection(): void {
		if (
			this._selectedComponentId &&
			!this._document.components.some((c) => c.id === this._selectedComponentId)
		) {
			this._selectedComponentId = null;
		}
		if (
			this._selectedWireId &&
			!this._document.wires.some((w) => w.id === this._selectedWireId)
		) {
			this._selectedWireId = null;
		}
	}

	undo(): boolean {
		if (this._undoStack.length === 0) return false;
		const previous = this._undoStack[this._undoStack.length - 1];
		this._undoStack = this._undoStack.slice(0, -1);

		const currentSnapshot: HistorySnapshot = {
			document: cloneDocument(this._document),
			theveninTarget: cloneTheveninTarget(this._theveninTarget)
		};
		this._redoStack = [...this._redoStack, currentSnapshot];

		this._document = cloneDocument(previous.document);
		this._theveninTarget = cloneTheveninTarget(previous.theveninTarget);
		this.reconcileSelection();
		return true;
	}

	redo(): boolean {
		if (this._redoStack.length === 0) return false;
		const next = this._redoStack[this._redoStack.length - 1];
		this._redoStack = this._redoStack.slice(0, -1);

		const currentSnapshot: HistorySnapshot = {
			document: cloneDocument(this._document),
			theveninTarget: cloneTheveninTarget(this._theveninTarget)
		};
		this._undoStack = [...this._undoStack, currentSnapshot];

		this._document = cloneDocument(next.document);
		this._theveninTarget = cloneTheveninTarget(next.theveninTarget);
		this.reconcileSelection();
		return true;
	}

	setActiveTool(tool: EditorTool, sourceMode?: SourceMode): void {
		this._activeTool = tool;
		if (sourceMode) {
			this._activeSourceMode = sourceMode;
		}
	}

	selectComponent(id: string | null): void {
		this._selectedComponentId = id;
		this._selectedWireId = null;
	}

	selectWire(id: string | null): void {
		this._selectedWireId = id;
		this._selectedComponentId = null;
	}

	clearSelection(): void {
		this._selectedComponentId = null;
		this._selectedWireId = null;
	}

	addComponent(
		kind: ComponentKind,
		x: number,
		y: number,
		opts?: AddComponentOptions
	): CircuitComponent {
		this.recordSnapshot();

		const sourceMode = opts?.sourceMode ?? this._activeSourceMode;
		const generated = nextUniqueLabel(kind, this._document.components);
		const label = opts?.label?.trim() || generated.label;

		// Ensure id is unique even if a custom label collides
		let id = label;
		if (this._document.components.some((c) => c.id === id)) {
			const fallback = nextUniqueLabel(kind, this._document.components);
			id = fallback.label;
		}

		const value = opts?.value ?? getDefaultValue(kind, sourceMode);
		const parsedNumeric = parseEngineeringNumber(value);

		const component: CircuitComponent = {
			id,
			kind,
			label,
			x: Math.round(x),
			y: Math.round(y),
			rotation: opts?.rotation ?? this._placementRotation,
			value,
			numericValue: parsedNumeric ?? undefined,
			phaseDeg: opts?.phaseDeg,
			frequencyHz: opts?.frequencyHz,
			unit: opts?.unit ?? DEFAULT_UNITS[kind],
			terminalName:
				kind === 'terminal' ? (opts?.terminalName ?? generated.terminalName ?? 'A') : undefined
		};

		this._document = {
			...this._document,
			components: [...this._document.components, component]
		};
		this._selectedComponentId = component.id;
		this._selectedWireId = null;
		return component;
	}

	moveComponent(
		id: string,
		x: number,
		y: number,
		options?: { recordUndo?: boolean }
	): void {
		const target = this._document.components.find((c) => c.id === id);
		if (!target) return;

		const nx = Math.round(x);
		const ny = Math.round(y);
		if (target.x === nx && target.y === ny) return;

		if (options?.recordUndo !== false) {
			this.recordSnapshot();
		}

		this._document = {
			...this._document,
			components: this._document.components.map((c) =>
				c.id === id ? { ...c, x: nx, y: ny } : c
			)
		};
	}

	rotatePlacement(): Rotation {
		this._placementRotation = ((this._placementRotation + 90) % 360) as Rotation;
		return this._placementRotation;
	}

	rotateComponent(id?: string | null): void {
		if (!id) {
			this.rotatePlacement();
			return;
		}
		const target = this._document.components.find((c) => c.id === id);
		if (!target) {
			this.rotatePlacement();
			return;
		}

		this.recordSnapshot();
		const nextRot = ((target.rotation + 90) % 360) as Rotation;
		this._document = {
			...this._document,
			components: this._document.components.map((c) =>
				c.id === id ? { ...c, rotation: nextRot } : c
			)
		};
	}

	updateComponent(
		id: string,
		patch: Partial<Omit<CircuitComponent, 'id' | 'kind'>>
	): void {
		const target = this._document.components.find((c) => c.id === id);
		if (!target) return;

		this.recordSnapshot();

		const nextValue = patch.value !== undefined ? patch.value : target.value;
		const nextNumeric =
			patch.value !== undefined
				? (parseEngineeringNumber(nextValue) ?? undefined)
				: patch.numericValue !== undefined
					? patch.numericValue
					: target.numericValue;

		this._document = {
			...this._document,
			components: this._document.components.map((c) =>
				c.id === id
					? {
							...c,
							...patch,
							value: nextValue,
							numericValue: nextNumeric
						}
					: c
			)
		};
	}

	deleteComponent(id: string): void {
		if (!this._document.components.some((c) => c.id === id)) return;
		this.recordSnapshot();

		this._document = {
			...this._document,
			components: this._document.components.filter((c) => c.id !== id)
		};

		if (this._selectedComponentId === id) {
			this._selectedComponentId = null;
		}
		if (
			this._theveninTarget?.kind === 'component' &&
			this._theveninTarget.componentId === id
		) {
			this._theveninTarget = undefined;
		}
	}

	deleteSelected(): void {
		if (this._selectedComponentId) {
			this.deleteComponent(this._selectedComponentId);
		} else if (this._selectedWireId) {
			this.deleteWire(this._selectedWireId);
		}
	}

	addWire(points: GridPoint[]): CircuitWire | null {
		const normalized = normalizeWirePoints(points);
		if (normalized.length < 2) return null;

		const hasNonZeroLength = normalized.some((pt, idx) => {
			if (idx === 0) return false;
			const prev = normalized[idx - 1];
			return pt.x !== prev.x || pt.y !== prev.y;
		});
		if (!hasNonZeroLength) return null;

		if (this._document.wires.some((w) => wiresEqual(w.points, normalized))) {
			return null;
		}

		this.recordSnapshot();
		const wire: CircuitWire = {
			id: nextUniqueWireId(this._document.wires),
			points: normalized
		};

		this._document = {
			...this._document,
			wires: [...this._document.wires, wire]
		};
		return wire;
	}

	deleteWire(id: string): void {
		if (!this._document.wires.some((w) => w.id === id)) return;
		this.recordSnapshot();

		this._document = {
			...this._document,
			wires: this._document.wires.filter((w) => w.id !== id)
		};
		if (this._selectedWireId === id) {
			this._selectedWireId = null;
		}
	}

	setMode(mode: AnalysisMode): void {
		if (this._document.mode === mode) return;
		this.recordSnapshot();
		this._document = {
			...this._document,
			mode
		};
		this._activeSourceMode = mode;
	}

	setFrequency(hz: number): void {
		if (!Number.isFinite(hz) || hz <= 0) return;
		if (this._document.frequencyHz === hz) return;
		this.recordSnapshot();
		this._document = {
			...this._document,
			frequencyHz: hz
		};
	}

	setDocumentName(name: string): void {
		const trimmed = name.trim();
		if (!trimmed || trimmed === this._document.name) return;
		this.recordSnapshot();
		this._document = {
			...this._document,
			name: trimmed
		};
	}

	loadDocument(doc: CircuitDocument, theveninLoadId?: string): void {
		this.recordSnapshot();
		const cloned = cloneDocument(doc);
		this._document = cloned;
		this._selectedComponentId = null;
		this._selectedWireId = null;
		this._activeSourceMode = cloned.mode;

		if (theveninLoadId && cloned.components.some((c) => c.id === theveninLoadId)) {
			this._theveninTarget = { kind: 'component', componentId: theveninLoadId };
		} else {
			this._theveninTarget = undefined;
		}
	}

	loadPreset(presetId: string): boolean {
		const preset = getPresetById(presetId);
		if (!preset) return false;
		this.loadDocument(preset.document, preset.theveninLoadId);
		this._activeMethod = preset.featuredMethod;
		return true;
	}

	clearCircuit(): void {
		if (this._document.components.length === 0 && this._document.wires.length === 0) {
			return;
		}
		this.recordSnapshot();
		this._document = {
			schemaVersion: 1,
			name: 'Untitled Circuit',
			mode: this._document.mode,
			frequencyHz: this._document.frequencyHz,
			acMagnitudeMode: this._document.acMagnitudeMode,
			components: [],
			wires: []
		};
		this._selectedComponentId = null;
		this._selectedWireId = null;
		this._theveninTarget = undefined;
	}

	setTheveninComponent(id: string): void {
		if (!this._document.components.some((c) => c.id === id)) return;
		this._theveninTarget = { kind: 'component', componentId: id };
	}

	setTheveninTerminals(nodeA: string, nodeB: string): void {
		if (!nodeA || !nodeB || nodeA === nodeB) return;
		this._theveninTarget = { kind: 'terminals', nodeA, nodeB };
	}

	clearTheveninTarget(): void {
		this._theveninTarget = undefined;
	}

	/** Resets the store cleanly back to initial PRESETS[0] with empty undo/redo stacks (for tests). */
	resetToDefault(): void {
		this._document = cloneDocument(initialPreset.document);
		this._selectedComponentId = null;
		this._selectedWireId = null;
		this._activeTool = 'select';
		this._activeSourceMode = initialPreset.document.mode;
		this._placementRotation = 0;
		this._theveninTarget = initialPreset.theveninLoadId
			? { kind: 'component', componentId: initialPreset.theveninLoadId }
			: undefined;
		this._activeMethod = initialPreset.featuredMethod ?? 'nodal';
		this._undoStack = [];
		this._redoStack = [];
	}
}

export const circuit = new CircuitStore();
