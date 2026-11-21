/**
 * Core domain types for Circuit Lab's electrical engine, netlist, MNA solver,
 * and step-by-step mathematical derivation pipeline.
 */

import type { Complex } from './complex';

export type SchematicStandard = 'ieee' | 'iec';
export type AnalysisMode = 'dc' | 'ac';
export type AcMagnitudeMode = 'rms' | 'peak';

export type ComponentKind =
	| 'resistor'
	| 'capacitor'
	| 'inductor'
	| 'voltage_source'
	| 'current_source'
	| 'ground'
	| 'terminal';

/**
 * Reserved component kinds for v2 dependent sources (VCVS, VCCS, CCVS, CCCS).
 */
export type DependentSourceKind = 'vcvs' | 'vccs' | 'ccvs' | 'cccs';
export type AnyComponentKind = ComponentKind | DependentSourceKind;

export type Rotation = 0 | 90 | 180 | 270;

export interface GridPoint {
	x: number;
	y: number;
}

/**
 * Reserved control reference for v2 dependent sources (`vcvs`, `vccs`, `ccvs`, `cccs`),
 * enabling zero-breaking-change extension of `CircuitComponent` and `mna.ts`.
 */
export interface DependentControlRef {
	/** For voltage-controlled sources (VCVS/VCCS): controlling positive/negative nodes */
	controlNodePos?: string;
	controlNodeNeg?: string;
	/** For current-controlled sources (CCVS/CCCS): ID of branch sensing control current */
	controlBranchComponentId?: string;
	/** Scalar or complex gain (A_v, g_m, r_m, beta) */
	gain?: number | string;
}

export interface CircuitComponent {
	id: string;
	kind: ComponentKind;
	label: string;
	x: number;
	y: number;
	rotation: Rotation;
	/** Engineering value string, e.g. "10k", "4.7u", "10∠30°" */
	value: string;
	/** Optional pre-parsed numeric magnitude (used if value string is omitted or synced) */
	numericValue?: number;
	/** Optional AC phase in degrees (for sources) */
	phaseDeg?: number;
	/** Optional per-source frequency in Hz (for multi-frequency AC superposition) */
	frequencyHz?: number;
	/** Optional unit label (e.g. "Ω", "F", "H", "V", "A") */
	unit?: string;
	/** Optional port name for 'terminal' components (e.g. "A", "B") */
	terminalName?: string;
	/** Reserved for v2 dependent sources (VCVS, VCCS, CCVS, CCCS) */
	controlRef?: DependentControlRef;
}

export interface CircuitWire {
	id: string;
	points: GridPoint[];
}

export interface CircuitDocument {
	schemaVersion: 1;
	id?: string;
	name?: string;
	mode: AnalysisMode;
	frequencyHz: number;
	acMagnitudeMode?: AcMagnitudeMode;
	components: CircuitComponent[];
	wires: CircuitWire[];
}

export interface NetlistElement {
	id?: string;
	kind: ComponentKind;
	label: string;
	/** Node names in pin order: [pin0, pin1] for 2-terminal, [pin0] for 1-terminal */
	nodes: string[];
	value: string;
	phaseDeg?: number;
	terminalName?: string;
	/** Reserved for v2 dependent sources */
	controlRef?: DependentControlRef;
}

export interface AINetlistDocument {
	schemaVersion?: 1;
	name?: string;
	mode?: AnalysisMode;
	frequencyHz?: number;
	acMagnitudeMode?: AcMagnitudeMode;
	groundNode?: string;
	elements: NetlistElement[];
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface ValidationDiagnostic {
	severity: DiagnosticSeverity;
	code: string;
	message: string;
	componentIds?: string[];
	nodeIds?: string[];
}

export interface NodePinAttachment {
	componentId: string;
	pinIndex: number;
	pinName: string;
}

export interface NodeResult {
	nodeId: string;
	voltage: Complex;
	isReference: boolean;
	componentPins: NodePinAttachment[];
	gridPoints: GridPoint[];
}

export interface BranchResult {
	componentId: string;
	label: string;
	kind: ComponentKind;
	nodeA: string;
	nodeB: string;
	/** Passive sign convention: V_e = V_pin0 - V_pin1 */
	voltage: Complex;
	/** Passive sign convention: I_e flows from pin 0 to pin 1 */
	current: Complex;
	/** Complex impedance Z (null for ideal sources or DC open capacitors; 0 for DC shorted inductors) */
	impedance: Complex | null;
	/** Complex power absorbed by element: S = P + jQ */
	complexPower: Complex;
	/** Real power absorbed in Watts (negative means supplied) */
	realPower: number;
	/** Reactive power absorbed in VAR */
	reactivePower: number;
	/** Apparent power |S| in VA */
	apparentPower: number;
	/** Power factor P / |S|, or null if |S| == 0 */
	powerFactor: number | null;
	powerFactorType?: 'leading' | 'lagging' | 'unity';
}

export interface PowerSummary {
	totalRealPower: number;
	totalReactivePower: number;
	totalAbsorbedReal: number;
	totalSuppliedReal: number;
	balanced: boolean;
}

export interface MnaSystemSnapshot {
	A: Complex[][];
	b: Complex[];
	x: Complex[];
	unknownLabels: string[];
	nodeOrder: string[];
	voltageBranchOrder: string[];
}

export interface MnaSolution {
	valid: boolean;
	mode: AnalysisMode;
	frequencyHz: number;
	acMagnitudeMode: AcMagnitudeMode;
	diagnostics: ValidationDiagnostic[];
	nodeVoltages: Record<string, NodeResult>;
	branches: Record<string, BranchResult>;
	powerBalance: PowerSummary;
	system?: MnaSystemSnapshot;
	pivotMin?: number;
}

export interface SolutionStep {
	title: string;
	description: string;
	latex?: string[];
	matrixLatex?: string;
	highlightIds?: string[];
	snapshotNote?: string;
}

export type MethodId =
	| 'kcl_kvl'
	| 'nodal'
	| 'mesh'
	| 'superposition'
	| 'source_transform'
	| 'thevenin_norton';

export interface MethodResult {
	methodId: MethodId;
	title: string;
	applicable: boolean;
	inapplicableReason?: string;
	steps: SolutionStep[];
	summaryLatex?: string;
	/** True when independently solved voltages/currents match MNA within < 1e-8 */
	verifiedAgainstMna?: boolean;
	/** Maximum absolute discrepancy against MNA ground truth */
	maxDiscrepancy?: number;
}

export type TheveninTarget =
	| { kind: 'component'; componentId: string }
	| { kind: 'terminals'; nodeA: string; nodeB: string };

export interface MaxPowerTransferInfo {
	optimalLoadImpedance: Complex;
	maxRealPowerW: number;
}

export interface TheveninNortonResult {
	terminalA: string;
	terminalB: string;
	loadComponentId?: string;
	vth: Complex;
	isc: Complex | null;
	zth: Complex | null;
	maxPowerTransfer?: MaxPowerTransferInfo;
	verifiedAgainstMna?: boolean;
	maxDiscrepancy?: number;
	steps: SolutionStep[];
}

export interface FullSolveResult {
	mna: MnaSolution;
	methods: Partial<Record<MethodId, MethodResult>>;
	theveninNorton?: TheveninNortonResult;
	allVerified: boolean;
	maxDiscrepancy: number;
}
