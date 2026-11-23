/**
 * 100%-accurate Complex Modified Nodal Analysis (MNA) engine for DC & AC steady-state circuits.
 *
 * Canonical Passive Sign Convention:
 * - Element voltage: V_e = V_pin0 - V_pin1
 * - Branch current: I_e flows from pin 0 to pin 1 through the element
 * - Voltage source: V_pin0 - V_pin1 = V_s
 * - Current source: forces I_s from pin 0 to pin 1 (leaves pin 0, enters pin 1)
 * - Complex power absorbed: S = V_e * conj(I_e) (RMS) or 0.5 * V_e * conj(I_e) (Peak AC)
 *
 * Extension hooks for v2 dependent sources (VCVS, VCCS, CCVS, CCCS) plug directly
 * into `MnaStampContext` without breaking any public types or function signatures.
 */

import { Complex } from './complex';
import {
	buildElectricalGraph,
	getPassiveImpedance,
	parseSourceValue,
	validateCircuitTopology
} from './graph';
import { solveComplexLinearSystem } from './linalg';
import type {
	AcMagnitudeMode,
	BranchResult,
	CircuitComponent,
	CircuitDocument,
	MnaSolution,
	NodeResult,
	PowerSummary,
	ValidationDiagnostic
} from './types';

export interface SolveMnaOptions {
	frequencyHz?: number;
	acMagnitudeMode?: AcMagnitudeMode;
}

export interface MnaStampContext {
	A: Complex[][];
	b: Complex[];
	nodeIndex: Map<string, number>;
	numNodes: number;
}

/**
 * Stamps a linear admittance Y = 1/Z connected between nodeA (pin 0) and nodeB (pin 1).
 */
export function stampAdmittance(
	ctx: MnaStampContext,
	nodeA: string,
	nodeB: string,
	y: Complex
): void {
	const a = ctx.nodeIndex.get(nodeA);
	const b = ctx.nodeIndex.get(nodeB);
	if (a !== undefined) {
		ctx.A[a][a] = ctx.A[a][a].add(y);
		if (b !== undefined) {
			ctx.A[a][b] = ctx.A[a][b].sub(y);
		}
	}
	if (b !== undefined) {
		ctx.A[b][b] = ctx.A[b][b].add(y);
		if (a !== undefined) {
			ctx.A[b][a] = ctx.A[b][a].sub(y);
		}
	}
}

/**
 * Stamps a real resistance R (in Ohms) between nodeA and nodeB.
 */
export function stampResistor(
	ctx: MnaStampContext,
	nodeA: string,
	nodeB: string,
	resistance: number
): void {
	stampAdmittance(ctx, nodeA, nodeB, Complex.from(1 / resistance, 0));
}

/**
 * Stamps an independent voltage source enforcing V(nodeA) - V(nodeB) = voltage,
 * using auxiliary current unknown at row/column `ctx.numNodes + auxIdx`
 * where positive current flows from nodeA (pin 0) to nodeB (pin 1).
 */
export function stampVoltageSource(
	ctx: MnaStampContext,
	auxIdx: number,
	nodeA: string,
	nodeB: string,
	voltage: Complex
): void {
	const row = ctx.numNodes + auxIdx;
	const a = ctx.nodeIndex.get(nodeA);
	const b = ctx.nodeIndex.get(nodeB);
	const one = Complex.one();

	if (a !== undefined) {
		ctx.A[a][row] = ctx.A[a][row].add(one);
		ctx.A[row][a] = ctx.A[row][a].add(one);
	}
	if (b !== undefined) {
		ctx.A[b][row] = ctx.A[b][row].sub(one);
		ctx.A[row][b] = ctx.A[row][b].sub(one);
	}
	ctx.b[row] = ctx.b[row].add(voltage);
}

/**
 * Stamps an independent current source forcing `current` from nodeA (pin 0) to nodeB (pin 1).
 * KCL leaves nodeA by +I_s (so RHS[a] -= I_s) and enters nodeB by +I_s (so RHS[b] += I_s).
 */
export function stampCurrentSource(
	ctx: MnaStampContext,
	nodeA: string,
	nodeB: string,
	current: Complex
): void {
	const a = ctx.nodeIndex.get(nodeA);
	const b = ctx.nodeIndex.get(nodeB);
	if (a !== undefined) {
		ctx.b[a] = ctx.b[a].sub(current);
	}
	if (b !== undefined) {
		ctx.b[b] = ctx.b[b].add(current);
	}
}

/*
 * Reserved v2 dependent source stampers (plug directly into MnaStampContext):
 * - stampVCCS(ctx, outA, outB, ctrlPos, ctrlNeg, gm)
 * - stampVCVS(ctx, auxIdx, outA, outB, ctrlPos, ctrlNeg, av)
 * - stampCCCS(ctx, outA, outB, ctrlAuxIdx, beta)
 * - stampCCVS(ctx, auxIdx, outA, outB, ctrlAuxIdx, rm)
 */

function emptyPowerSummary(balanced = false): PowerSummary {
	return {
		totalRealPower: 0,
		totalReactivePower: 0,
		totalAbsorbedReal: 0,
		totalSuppliedReal: 0,
		balanced
	};
}

function makeInvalidSolution(
	doc: CircuitDocument,
	frequencyHz: number,
	acMagnitudeMode: AcMagnitudeMode,
	diagnostics: ValidationDiagnostic[]
): MnaSolution {
	return {
		valid: false,
		mode: doc.mode,
		frequencyHz,
		acMagnitudeMode,
		diagnostics,
		nodeVoltages: {},
		branches: {},
		powerBalance: emptyPowerSummary(false)
	};
}

/**
 * Solves a DC or AC steady-state linear circuit using Modified Nodal Analysis (MNA).
 */
export function solveMNA(doc: CircuitDocument, options?: SolveMnaOptions): MnaSolution {
	const mode = doc.mode;
	const frequencyHz = options?.frequencyHz ?? doc.frequencyHz;
	const acMagnitudeMode: AcMagnitudeMode =
		options?.acMagnitudeMode ?? doc.acMagnitudeMode ?? 'rms';

	const graph = buildElectricalGraph(doc);
	const diagnostics = validateCircuitTopology(graph, mode, frequencyHz);

	if (diagnostics.some((d) => d.severity === 'error')) {
		return makeInvalidSolution(doc, frequencyHz, acMagnitudeMode, diagnostics);
	}

	const nodeOrder = graph.nonRefNodeIds;
	const numNodes = nodeOrder.length;
	const nodeIndex = new Map<string, number>();
	nodeOrder.forEach((id, i) => nodeIndex.set(id, i));

	const twoTerminalComps = doc.components.filter(
		(c) => c.kind !== 'ground' && c.kind !== 'terminal'
	);
	const activeComps = twoTerminalComps.filter((c) => c.kind !== 'voltmeter');
	const voltmeters = twoTerminalComps.filter((c) => c.kind === 'voltmeter');

	// Components requiring auxiliary branch current unknowns in MNA
	const voltageBranches: CircuitComponent[] = activeComps.filter(
		(c) => c.kind === 'voltage_source' || (mode === 'dc' && c.kind === 'inductor')
	);
	const voltageBranchAuxMap = new Map<string, number>();
	voltageBranches.forEach((c, idx) => voltageBranchAuxMap.set(c.id, idx));

	const dim = numNodes + voltageBranches.length;
	const A: Complex[][] = Array.from({ length: dim }, () =>
		Array.from({ length: dim }, () => Complex.zero())
	);
	const b: Complex[] = Array.from({ length: dim }, () => Complex.zero());
	const ctx: MnaStampContext = { A, b, nodeIndex, numNodes };

	const componentImpedance = new Map<string, Complex | null>();
	const currentSourceValues = new Map<string, Complex>();

	for (const comp of activeComps) {
		const [nodeA, nodeB] = graph.componentNodes[comp.id];

		switch (comp.kind) {
			case 'resistor':
			case 'capacitor':
			case 'inductor': {
				const passive = getPassiveImpedance(comp, mode, frequencyHz)!;
				if (passive.kind === 'open') {
					// Open circuit in DC steady state (Y = 0, I = 0)
					componentImpedance.set(comp.id, null);
				} else if (passive.kind === 'short') {
					// Short circuit (0 V branch) in DC steady state
					const auxIdx = voltageBranchAuxMap.get(comp.id)!;
					stampVoltageSource(ctx, auxIdx, nodeA, nodeB, Complex.zero());
					componentImpedance.set(comp.id, Complex.zero());
				} else {
					const y = Complex.one().div(passive.z);
					stampAdmittance(ctx, nodeA, nodeB, y);
					componentImpedance.set(comp.id, passive.z);
				}
				break;
			}
			case 'voltage_source': {
				const vs = parseSourceValue(comp, mode)!;
				const auxIdx = voltageBranchAuxMap.get(comp.id)!;
				stampVoltageSource(ctx, auxIdx, nodeA, nodeB, vs);
				componentImpedance.set(comp.id, null);
				break;
			}
			case 'current_source': {
				const is = parseSourceValue(comp, mode)!;
				stampCurrentSource(ctx, nodeA, nodeB, is);
				currentSourceValues.set(comp.id, is);
				componentImpedance.set(comp.id, null);
				break;
			}
		}
	}

	let x: Complex[] = [];
	let pivotMin = 1;

	if (dim > 0) {
		const solved = solveComplexLinearSystem(A, b);
		pivotMin = solved.pivotMin;
		if (solved.singular) {
			diagnostics.push({
				severity: 'error',
				code: 'SINGULAR_MATRIX',
				message:
					'MNA matrix is singular (e.g., lossless parallel LC tank at exact resonance or degenerate topology).'
			});
			return makeInvalidSolution(doc, frequencyHz, acMagnitudeMode, diagnostics);
		}
		x = solved.x;
	}

	// Build node voltage map
	const nodeVoltages: Record<string, NodeResult> = {};
	if (graph.nodes['0']) {
		nodeVoltages['0'] = {
			nodeId: '0',
			voltage: Complex.zero(),
			isReference: true,
			componentPins: graph.nodes['0'].componentPins,
			gridPoints: graph.nodes['0'].gridPoints
		};
	}

	nodeOrder.forEach((nodeId, idx) => {
		const graphNode = graph.nodes[nodeId];
		nodeVoltages[nodeId] = {
			nodeId,
			voltage: x[idx],
			isReference: false,
			componentPins: graphNode.componentPins,
			gridPoints: graphNode.gridPoints
		};
	});

	// Build branch results & power balance
	const powerScale = mode === 'ac' && acMagnitudeMode === 'peak' ? 0.5 : 1;
	const branches: Record<string, BranchResult> = {};
	let totalRealPower = 0;
	let totalReactivePower = 0;
	let totalAbsorbedReal = 0;
	let totalSuppliedReal = 0;

	for (const comp of activeComps) {
		const [nodeA, nodeB] = graph.componentNodes[comp.id];
		const vA = nodeVoltages[nodeA]?.voltage ?? Complex.zero();
		const vB = nodeVoltages[nodeB]?.voltage ?? Complex.zero();
		const voltage = vA.sub(vB);
		const impedance = componentImpedance.get(comp.id) ?? null;

		let current: Complex;
		if (comp.kind === 'resistor' || comp.kind === 'capacitor' || comp.kind === 'inductor') {
			const passive = getPassiveImpedance(comp, mode, frequencyHz)!;
			if (passive.kind === 'open') {
				current = Complex.zero();
			} else if (passive.kind === 'short') {
				const auxIdx = voltageBranchAuxMap.get(comp.id)!;
				current = x[numNodes + auxIdx];
			} else {
				current = voltage.div(passive.z);
			}
		} else if (comp.kind === 'voltage_source') {
			const auxIdx = voltageBranchAuxMap.get(comp.id)!;
			current = x[numNodes + auxIdx];
		} else {
			current = currentSourceValues.get(comp.id)!;
		}

		const complexPower = voltage.mul(current.conj()).scale(powerScale);
		const realPower = complexPower.re;
		const reactivePower = complexPower.im;
		const apparentPower = complexPower.abs();

		// Sources report the power factor they deliver (S_supplied = -S_absorbed), which is the
		// textbook "source power factor": a source feeding an R + jX load is lagging, not leading.
		// Passives report the power factor of the power they absorb.
		const isSource = comp.kind === 'voltage_source' || comp.kind === 'current_source';
		const pfReal = isSource ? -realPower : realPower;
		const pfReactive = isSource ? -reactivePower : reactivePower;

		let powerFactor: number | null = null;
		let powerFactorType: BranchResult['powerFactorType'] = undefined;
		if (apparentPower > 1e-12) {
			powerFactor = Math.max(-1, Math.min(1, pfReal / apparentPower));
			if (Math.abs(pfReactive) <= 1e-12 * apparentPower) {
				powerFactorType = 'unity';
			} else if (pfReactive > 0) {
				powerFactorType = 'lagging';
			} else {
				powerFactorType = 'leading';
			}
		}

		totalRealPower += realPower;
		totalReactivePower += reactivePower;
		if (realPower > 0) totalAbsorbedReal += realPower;
		else if (realPower < 0) totalSuppliedReal += -realPower;

		branches[comp.id] = {
			componentId: comp.id,
			label: comp.label,
			kind: comp.kind,
			nodeA,
			nodeB,
			voltage,
			current,
			impedance,
			complexPower,
			realPower,
			reactivePower,
			apparentPower,
			powerFactor,
			powerFactorType
		};
	}

	// Post-solve ideal voltmeter readouts (open circuit: Y = 0, I = 0, S = 0)
	for (const vm of voltmeters) {
		const [nodeA, nodeB] = graph.componentNodes[vm.id] ?? [];
		if (!nodeA || !nodeB || !nodeVoltages[nodeA] || !nodeVoltages[nodeB]) {
			continue;
		}
		const voltage = nodeVoltages[nodeA].voltage.sub(nodeVoltages[nodeB].voltage);
		branches[vm.id] = {
			componentId: vm.id,
			label: vm.label,
			kind: 'voltmeter',
			isMeasurementOnly: true,
			nodeA,
			nodeB,
			voltage,
			current: Complex.zero(),
			impedance: null,
			complexPower: Complex.zero(),
			realPower: 0,
			reactivePower: 0,
			apparentPower: 0,
			powerFactor: null,
			powerFactorType: undefined
		};
	}

	const scaleRef = Math.max(1, totalAbsorbedReal, totalSuppliedReal);
	const tol = Math.max(1e-7, 1e-11 * scaleRef);
	const balanced = Math.abs(totalRealPower) < tol && Math.abs(totalReactivePower) < tol;

	const unknownLabels = [
		...nodeOrder.map((nid) => `V_{${nid}}`),
		...voltageBranches.map((c) => `I_{${c.label}}`)
	];

	return {
		valid: true,
		mode,
		frequencyHz,
		acMagnitudeMode,
		diagnostics,
		nodeVoltages,
		branches,
		powerBalance: {
			totalRealPower,
			totalReactivePower,
			totalAbsorbedReal,
			totalSuppliedReal,
			balanced
		},
		system: {
			A,
			b,
			x,
			unknownLabels,
			nodeOrder,
			voltageBranchOrder: voltageBranches.map((c) => c.id)
		},
		pivotMin
	};
}
