/**
 * Exact Analytical Unknown-Value / Inverse Circuit Solver.
 *
 * Solves for an unknown independent source (V, I) or passive element (R, C, L)
 * given a known measurement elsewhere in the circuit (node voltage, branch voltage,
 * branch current, or branch real power):
 *
 * - Unknown independent sources: exact Superposition / Linearity affine model
 *   y(X) = y(0) + k * X (linear constraints) and exact quadratic P_b(X) = P_target (power).
 * - Unknown passive elements: exact Thévenin / Möbius inversion
 *   y(Z_x) = (y_inf * Z_x + Z_th * y_0) / (Z_x + Z_th) (linear constraints)
 *   and exact quadratic real power inversion (power constraints, returning 1 or 2 positive roots
 *   and exact P_max diagnostics).
 *
 * Every candidate solution is independently cross-verified by substituting back into full MNA.
 */

import { Complex } from './complex';
import { buildElectricalGraph } from './graph';
import {
	buildDeactivatedDocument,
	formatLatexTerm,
	formatLatexValue,
	latexSub,
	MNA_VERIFICATION_TOL
} from './methods/shared';
import { solveMNA, type SolveMnaOptions } from './mna';
import type {
	AnalysisMode,
	CircuitComponent,
	CircuitConstraint,
	CircuitDocument,
	ComponentKind,
	MnaSolution,
	SolutionStep,
	UnknownProblemSpec,
	UnknownSolutionCandidate,
	UnknownSolveResult
} from './types';
import { formatEngineering, parseComplexValue, parseEngineeringNumber } from './units';

const SOLVABLE_KINDS = new Set<ComponentKind>([
	'voltage_source',
	'current_source',
	'resistor',
	'capacitor',
	'inductor'
]);

const SOURCE_KINDS = new Set<ComponentKind>(['voltage_source', 'current_source']);

const DEFAULT_SYMBOL_BY_KIND: Record<ComponentKind, string> = {
	voltage_source: 'V',
	current_source: 'I',
	resistor: 'R',
	capacitor: 'C',
	inductor: 'L',
	ground: 'GND',
	terminal: 'T'
};

const UNIT_BY_KIND: Partial<Record<ComponentKind, string>> = {
	voltage_source: 'V',
	current_source: 'A',
	resistor: 'Ω',
	capacitor: 'F',
	inductor: 'H'
};

export function getDefaultUnknownSymbol(kind: ComponentKind): string {
	return DEFAULT_SYMBOL_BY_KIND[kind] ?? 'X';
}

/**
 * Extracts the constrained quantity from a solved MNA result.
 */
export function measureConstraint(
	mna: MnaSolution,
	constraint: CircuitConstraint
): Complex | null {
	if (!mna.valid) return null;
	switch (constraint.kind) {
		case 'node_voltage':
			return mna.nodeVoltages[constraint.targetId]?.voltage ?? null;
		case 'branch_voltage':
			return mna.branches[constraint.targetId]?.voltage ?? null;
		case 'branch_current':
			return mna.branches[constraint.targetId]?.current ?? null;
		case 'branch_power': {
			const br = mna.branches[constraint.targetId];
			if (!br || !Number.isFinite(br.realPower)) return null;
			return Complex.from(br.realPower, 0);
		}
	}
}

/**
 * Returns a cloned CircuitDocument with the specified component's value replaced
 * (clearing any stale numericValue or phaseDeg so parsing is 100% deterministic)
 * and `unknownProblem` cleared so MNA solves the concrete circuit directly.
 */
export function substituteUnknownValue(
	doc: CircuitDocument,
	componentId: string,
	valueString: string,
	overridePhaseDeg?: number
): CircuitDocument {
	const parsedReal = parseEngineeringNumber(valueString);
	return {
		...doc,
		unknownProblem: undefined,
		components: doc.components.map((c) => {
			if (c.id !== componentId) return c;
			return {
				...c,
				value: valueString,
				numericValue: parsedReal ?? undefined,
				phaseDeg: overridePhaseDeg
			};
		})
	};
}

function formatRealCanonical(x: number): string {
	if (!Number.isFinite(x)) return String(x);
	if (Math.abs(x) < 1e-15) return '0';

	const clean6 = formatEngineering(x, '', 6);
	const parsed6 = parseEngineeringNumber(clean6);
	if (parsed6 !== null && Math.abs(parsed6 - x) <= 1e-12 * Math.max(1, Math.abs(x))) {
		return clean6;
	}

	const clean14 = formatEngineering(x, '', 14);
	const parsed14 = parseEngineeringNumber(clean14);
	if (parsed14 !== null && Math.abs(parsed14 - x) <= 1e-12 * Math.max(1, Math.abs(x))) {
		return clean14;
	}

	return Number(x.toPrecision(15)).toString();
}

function formatCanonicalValueString(
	val: Complex,
	kind: ComponentKind,
	mode: AnalysisMode
): string {
	if (mode === 'dc' || !SOURCE_KINDS.has(kind)) {
		return formatRealCanonical(val.re);
	}

	if (val.isZero(1e-15)) return '0';
	if (val.isReal(1e-12) && val.re >= 0) {
		return formatRealCanonical(val.re);
	}

	const mag = val.abs();
	const deg = Math.abs(val.argDeg()) < 1e-12 ? 0 : val.argDeg();

	const mag6 = formatEngineering(mag, '', 6);
	const deg6 = Number(deg.toPrecision(6)).toString();
	const polar6 = `${mag6}∠${deg6}°`;
	const parsed6 = parseComplexValue(polar6);
	if (parsed6 && parsed6.sub(val).abs() <= 1e-11 * Math.max(1, mag)) {
		return polar6;
	}

	const mag14 = formatRealCanonical(mag);
	const deg14 = Number(deg.toPrecision(14)).toString();
	return `${mag14}∠${deg14}°`;
}

function formatSymbolLatex(sym: string): string {
	const trimmed = sym.trim();
	if (!trimmed) return 'X';
	if (trimmed.includes('_')) {
		const [base, ...rest] = trimmed.split('_');
		const sub = rest.join('_').replace(/^\{|\}$/g, '');
		return `${latexSub(base) || 'X'}_{${latexSub(sub) || sub}}`;
	}
	const singlePrefix = trimmed.match(/^([A-Za-z])([A-Za-z0-9]+)$/);
	if (singlePrefix) {
		return `${singlePrefix[1]}_{${singlePrefix[2]}}`;
	}
	if (/^[A-Za-z]$/.test(trimmed)) {
		return trimmed;
	}
	return `\\text{${trimmed.replace(/[{}]/g, '')}}`;
}

function getConstraintUnit(kind: CircuitConstraint['kind']): string {
	switch (kind) {
		case 'node_voltage':
		case 'branch_voltage':
			return 'V';
		case 'branch_current':
			return 'A';
		case 'branch_power':
			return 'W';
	}
}

function formatConstraintQuantityProse(
	constraint: CircuitConstraint,
	doc: CircuitDocument
): string {
	if (constraint.label?.trim()) {
		return constraint.label.trim();
	}
	if (constraint.kind === 'node_voltage') {
		return `V(${constraint.targetId})`;
	}
	const targetComp = doc.components.find((c) => c.id === constraint.targetId);
	const targetLabel = targetComp?.label ?? constraint.targetId;
	switch (constraint.kind) {
		case 'branch_voltage':
			return `V(${targetLabel})`;
		case 'branch_current':
			return `I(${targetLabel})`;
		case 'branch_power':
			return `P(${targetLabel})`;
	}
}

function formatUnknownTargetProse(comp: CircuitComponent, sym: string): string {
	const trimmedSym = sym.trim();
	const trimmedLabel = comp.label.trim();
	const role = SOURCE_KINDS.has(comp.kind) ? 'unknown source' : 'unknown element';
	if (trimmedSym === trimmedLabel) {
		return `${role} ${trimmedSym}`;
	}
	return `${role} ${trimmedSym} (${trimmedLabel})`;
}

function getConstraintSymbolLatex(
	constraint: CircuitConstraint,
	doc: CircuitDocument
): string {
	if (constraint.label?.trim()) {
		return formatSymbolLatex(constraint.label.trim());
	}
	if (constraint.kind === 'node_voltage') {
		return `V_{${latexSub(constraint.targetId)}}`;
	}
	const targetComp = doc.components.find((c) => c.id === constraint.targetId);
	const sub = latexSub(targetComp?.label ?? constraint.targetId);
	switch (constraint.kind) {
		case 'branch_voltage':
			return `V_{${sub}}`;
		case 'branch_current':
			return `I_{${sub}}`;
		case 'branch_power':
			return `P_{${sub}}`;
	}
}

function appendLatexSubscript(symTex: string, suffix: string): string {
	if (symTex.endsWith('}')) {
		const idx = symTex.lastIndexOf('_{');
		if (idx !== -1) {
			return `${symTex.slice(0, -1)},\\text{${suffix}}}`;
		}
	}
	return `${symTex}_{\\text{${suffix}}}`;
}

function solveRealQuadratic(a: number, b: number, c: number): number[] {
	const scale = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c));
	if (Math.abs(a) <= 1e-15 * scale) {
		if (Math.abs(b) <= 1e-15 * scale) {
			return [];
		}
		return [-c / b];
	}

	const disc = b * b - 4 * a * c;
	const discTol = 1e-11 * Math.max(b * b, 4 * Math.abs(a * c), 1);
	if (disc < -discTol) {
		return [];
	}
	if (disc <= discTol) {
		return [-b / (2 * a)];
	}

	const sqrtD = Math.sqrt(disc);
	const q = -0.5 * (b + (b >= 0 ? sqrtD : -sqrtD));
	const r1 = q / a;
	const r2 = Math.abs(q) > 1e-30 ? c / q : (-b + (b >= 0 ? sqrtD : -sqrtD)) / (2 * a);

	if (Math.abs(r1 - r2) <= 1e-9 * Math.max(1, Math.abs(r1), Math.abs(r2))) {
		return [r1];
	}
	return [r1, r2];
}

function dedupeAndSortRoots(roots: number[], preferPositiveFirst: boolean): number[] {
	const unique: number[] = [];
	for (const r of roots) {
		if (!Number.isFinite(r)) continue;
		const cleaned = Math.abs(r) < 1e-14 ? 0 : r;
		if (!unique.some((u) => Math.abs(u - cleaned) <= 1e-9 * Math.max(1, Math.abs(u), Math.abs(cleaned)))) {
			unique.push(cleaned);
		}
	}

	if (preferPositiveFirst) {
		unique.sort((x, y) => {
			const xPos = x >= 0 ? 0 : 1;
			const yPos = y >= 0 ? 0 : 1;
			if (xPos !== yPos) return xPos - yPos;
			return Math.abs(x) - Math.abs(y);
		});
	} else {
		unique.sort((x, y) => x - y);
	}

	return unique;
}

function mapOriginalNodeToSubGraph(
	origGraph: ReturnType<typeof buildElectricalGraph>,
	subGraph: ReturnType<typeof buildElectricalGraph>,
	origNodeId: string
): string | null {
	const origNode = origGraph.nodes[origNodeId];
	if (!origNode) return null;
	for (const gp of origNode.gridPoints) {
		for (const [subId, subNode] of Object.entries(subGraph.nodes)) {
			if (subNode.gridPoints.some((p) => p.x === gp.x && p.y === gp.y)) {
				return subId;
			}
		}
	}
	return null;
}

function makeFailure(
	comp: CircuitComponent | undefined,
	problem: UnknownProblemSpec,
	methodName: string,
	error: string,
	steps: SolutionStep[] = []
): UnknownSolveResult {
	const kind: ComponentKind = comp?.kind ?? 'resistor';
	return {
		valid: false,
		componentId: problem.componentId,
		componentLabel: comp?.label ?? problem.componentId,
		componentKind: kind,
		symbol: problem.symbol?.trim() || getDefaultUnknownSymbol(kind),
		constraint: problem.constraint,
		methodName,
		solutions: [],
		error,
		steps
	};
}

function verifyCandidate(
	doc: CircuitDocument,
	comp: CircuitComponent,
	value: Complex,
	constraint: CircuitConstraint,
	yTarget: Complex,
	mode: AnalysisMode,
	solveOpts: SolveMnaOptions
): UnknownSolutionCandidate {
	const valueString = formatCanonicalValueString(value, comp.kind, mode);
	const docSolved = substituteUnknownValue(doc, comp.id, valueString);
	const mnaSolved = solveMNA(docSolved, solveOpts);
	const ySolved = measureConstraint(mnaSolved, constraint);
	const discrepancy = ySolved ? ySolved.sub(yTarget).abs() : Infinity;
	const verified =
		mnaSolved.valid && Number.isFinite(discrepancy) && discrepancy < MNA_VERIFICATION_TOL;

	return {
		value,
		valueString,
		discrepancy,
		verified
	};
}

function formatSensitivityUnit(yUnit: string, xUnit: string): string {
	if (yUnit === xUnit) return '';
	if (yUnit === 'A' && xUnit === 'V') return '\\text{ S}';
	if (yUnit === 'V' && xUnit === 'A') return '\\;\\Omega';
	return `\\text{ ${yUnit}/${xUnit}}`;
}

export function formatLatexResidual(value: number, unit: string): string {
	const unitTex = unit ? (unit === 'Ω' ? '\\;\\Omega' : `\\text{ ${unit}}`) : '';
	if (!Number.isFinite(value)) {
		return `\\infty${unitTex}`;
	}
	if (Math.abs(value) < 1e-12) {
		return `0${unitTex}`;
	}
	const [mantissa, expRaw] = value.toExponential(2).split('e');
	const exp = Number.parseInt(expRaw, 10);
	if (exp === 0) {
		return `${mantissa}${unitTex}`;
	}
	return `${mantissa} \\times 10^{${exp}}${unitTex}`;
}

function formatComplexAnswerLatex(val: Complex, unit: string, mode: AnalysisMode): string {
	const unitTex = unit === 'Ω' ? '\\;\\Omega' : `\\text{ ${unit}}`;
	if (mode === 'dc' || val.isReal(1e-12)) {
		return `${formatLatexValue(val, mode)}${unitTex}`;
	}
	return `${val.toLatexPolar(4)}${unitTex} = ${val.toLatexRect(4)}${unitTex}`;
}

/**
 * Case A: Unknown independent voltage or current source.
 */
function solveUnknownSource(
	doc: CircuitDocument,
	comp: CircuitComponent,
	problem: UnknownProblemSpec,
	yTarget: Complex,
	solveOpts: SolveMnaOptions
): UnknownSolveResult {
	const mode = doc.mode;
	const constraint = problem.constraint;
	const sym = problem.symbol?.trim() || getDefaultUnknownSymbol(comp.kind);
	const symTex = formatSymbolLatex(sym);
	const xUnit = UNIT_BY_KIND[comp.kind] ?? '';
	const ySymTex = getConstraintSymbolLatex(constraint, doc);
	const yUnit = getConstraintUnit(constraint.kind);
	const methodName =
		constraint.kind === 'branch_power'
			? 'Linearity / Quadratic Power Inversion'
			: 'Linearity / Superposition';

	if (constraint.kind === 'branch_power' && mode === 'ac') {
		return makeFailure(
			comp,
			problem,
			methodName,
			'Real power P alone is a single scalar constraint and cannot uniquely determine both magnitude and phase of an AC phasor source. Use a phasor voltage or current constraint, or switch to DC mode.'
		);
	}

	const doc0 = substituteUnknownValue(doc, comp.id, '0', 0);
	const doc1 = substituteUnknownValue(doc, comp.id, '1', 0);
	const mna0 = solveMNA(doc0, solveOpts);
	const mna1 = solveMNA(doc1, solveOpts);

	if (!mna0.valid || !mna1.valid) {
		const diag =
			mna0.diagnostics.find((d) => d.severity === 'error')?.message ??
			mna1.diagnostics.find((d) => d.severity === 'error')?.message ??
			'Circuit topology is invalid and cannot be solved.';
		return makeFailure(comp, problem, methodName, diag);
	}

	// Subcase A2: DC branch power constraint -> exact quadratic in X
	if (constraint.kind === 'branch_power') {
		const b0 = mna0.branches[constraint.targetId];
		const b1 = mna1.branches[constraint.targetId];
		if (!b0 || !b1) {
			return makeFailure(
				comp,
				problem,
				methodName,
				`Target branch "${constraint.targetId}" was not found in the circuit.`
			);
		}

		const v0 = b0.voltage.re;
		const kv = b1.voltage.re - v0;
		const i0 = b0.current.re;
		const ki = b1.current.re - i0;
		const pTarget = yTarget.re;

		const a = kv * ki;
		const b = v0 * ki + i0 * kv;
		const c = v0 * i0 - pTarget;

		const scale = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c));
		if (Math.abs(a) <= 1e-15 * scale && Math.abs(b) <= 1e-15 * scale) {
			return makeFailure(
				comp,
				problem,
				methodName,
				'The target branch power is independent of this source (sensitivity k = 0).'
			);
		}

		const rawRoots = solveRealQuadratic(a, b, c);
		if (rawRoots.length === 0) {
			const extremum = v0 * i0 - (b * b) / (4 * a);
			const boundWord = a > 0 ? 'minimum achievable' : 'maximum achievable';
			return makeFailure(
				comp,
				problem,
				methodName,
				`No real source value achieves P = ${formatEngineering(pTarget, 'W', 4)} (${boundWord} branch power is ${formatEngineering(extremum, 'W', 4)}).`
			);
		}

		const roots = dedupeAndSortRoots(rawRoots, true);
		const candidates = roots.map((r) =>
			verifyCandidate(doc, comp, Complex.from(r, 0), constraint, yTarget, mode, solveOpts)
		);

		const targetLabel = latexSub(b0.label);
		const steps: SolutionStep[] = [
			{
				title: '1. Problem Statement & Affine Branch Model',
				description: `By linearity of the circuit with respect to the ${formatUnknownTargetProse(comp, sym)}, both the voltage and current of branch ${b0.label} are affine functions of ${sym}.`,
				latex: [
					`V_{${targetLabel}}(${symTex}) = v_0 + k_v ${symTex} = ${formatLatexValue(Complex.from(v0, 0), 'dc')} + ${formatLatexTerm(Complex.from(kv, 0), 'dc')}${symTex}`,
					`I_{${targetLabel}}(${symTex}) = i_0 + k_i ${symTex} = ${formatLatexValue(Complex.from(i0, 0), 'dc')} + ${formatLatexTerm(Complex.from(ki, 0), 'dc')}${symTex}`
				],
				highlightIds: [comp.id, constraint.targetId]
			},
			{
				title: '2. Quadratic Power Equation',
				description: `Substituting V(${sym}) and I(${sym}) into P = V · I = ${formatEngineering(pTarget, 'W', 4)} yields an exact quadratic in ${sym}.`,
				latex: [
					`P_{${targetLabel}}(${symTex}) = V_{${targetLabel}}(${symTex})\\,I_{${targetLabel}}(${symTex}) = ${formatLatexValue(Complex.from(pTarget, 0), 'dc')}\\text{ W}`,
					`${formatLatexValue(Complex.from(a, 0), 'dc')}\\,${symTex}^2 + ${formatLatexTerm(Complex.from(b, 0), 'dc')}\\,${symTex} + ${formatLatexTerm(Complex.from(c, 0), 'dc')} = 0`
				]
			},
			{
				title: '3. Exact Roots & MNA Verification',
				description: `Solved the quadratic equation exactly and independently verified ${candidates.length === 1 ? 'the root' : 'both roots'} via full MNA re-solve.`,
				latex: candidates.map((cand, idx) => {
					const name = candidates.length > 1 ? `${symTex}_{${idx + 1}}` : symTex;
					return `${name} = ${formatComplexAnswerLatex(cand.value, xUnit, 'dc')} \\quad (|\\Delta P| = ${formatLatexResidual(cand.discrepancy, 'W')})`;
				})
			}
		];

		return {
			valid: true,
			componentId: comp.id,
			componentLabel: comp.label,
			componentKind: comp.kind,
			symbol: sym,
			constraint,
			methodName,
			solutions: candidates,
			steps
		};
	}

	// Subcase A1: Linear constraint (node_voltage, branch_voltage, branch_current)
	const y0 = measureConstraint(mna0, constraint);
	const y1 = measureConstraint(mna1, constraint);
	if (!y0 || !y1) {
		return makeFailure(
			comp,
			problem,
			methodName,
			`Target measurement "${constraint.targetId}" was not found in the circuit.`
		);
	}

	const k = y1.sub(y0);
	if (k.abs() < 1e-14) {
		return makeFailure(
			comp,
			problem,
			methodName,
			'The measured quantity is independent of this source (sensitivity k = 0).'
		);
	}

	const solvedRaw = yTarget.sub(y0).div(k);
	const solved = mode === 'dc' ? Complex.from(solvedRaw.re, 0) : solvedRaw;
	const candidate = verifyCandidate(doc, comp, solved, constraint, yTarget, mode, solveOpts);
	const kUnitTex = formatSensitivityUnit(yUnit, xUnit);
	const yTargetTex = appendLatexSubscript(ySymTex, 'target');

	const steps: SolutionStep[] = [
		{
			title: '1. Problem Statement & Linearity Model',
			description: `By superposition and linearity, the measured quantity ${formatConstraintQuantityProse(constraint, doc)} is strictly affine in the ${formatUnknownTargetProse(comp, sym)}.`,
			latex: [
				`${ySymTex}(${symTex}) = ${ySymTex}(0) + k \\cdot ${symTex}`,
				`${yTargetTex} = ${formatComplexAnswerLatex(yTarget, yUnit, mode)}`
			],
			highlightIds:
				constraint.kind === 'node_voltage' ? [comp.id] : [comp.id, constraint.targetId]
		},
		{
			title: '2. Zero-Source & Unit-Source Responses',
			description: `Evaluated the circuit with ${comp.label} = 0 ${xUnit} (deactivated) and ${comp.label} = 1 ${xUnit} to compute exact transfer sensitivity k.`,
			latex: [
				`${ySymTex}(0) = ${formatLatexValue(y0, mode)}\\text{ ${yUnit}}`,
				`${ySymTex}(1) = ${formatLatexValue(y1, mode)}\\text{ ${yUnit}}`,
				`k = ${ySymTex}(1) - ${ySymTex}(0) = ${formatLatexValue(k, mode)}${kUnitTex}`
			]
		},
		{
			title: '3. Exact Closed-Form Solution & MNA Verification',
			description: `Inverted the affine relation directly and confirmed the solution by full MNA re-solve.`,
			latex: [
				`${symTex} = \\frac{${yTargetTex} - ${ySymTex}(0)}{k} = ${formatComplexAnswerLatex(candidate.value, xUnit, mode)}`,
				`|${ySymTex}(${symTex}) - ${yTargetTex}| = ${formatLatexResidual(candidate.discrepancy, yUnit)}`
			]
		}
	];

	return {
		valid: true,
		componentId: comp.id,
		componentLabel: comp.label,
		componentKind: comp.kind,
		symbol: sym,
		constraint,
		methodName,
		solutions: [candidate],
		steps
	};
}

interface PortEquivalent {
	kind: 'finite' | 'zero_zth' | 'inf_zth';
	vth?: Complex;
	zth?: Complex;
	isc?: Complex;
	openDoc?: CircuitDocument;
	openGraph?: ReturnType<typeof buildElectricalGraph>;
	openSol?: MnaSolution;
	shortDoc?: CircuitDocument;
	shortSol?: MnaSolution;
	refDoc?: CircuitDocument;
	refSol?: MnaSolution;
	error?: string;
}

function replaceWithShortSource(doc: CircuitDocument, comp: CircuitComponent): CircuitDocument {
	return {
		...doc,
		unknownProblem: undefined,
		components: doc.components.map((c) =>
			c.id === comp.id
				? {
						...c,
						kind: 'voltage_source',
						value: '0',
						numericValue: 0,
						phaseDeg: 0,
						unit: 'V'
					}
				: c
		)
	};
}

function replaceWithUnitResistor(doc: CircuitDocument, comp: CircuitComponent): CircuitDocument {
	return {
		...doc,
		unknownProblem: undefined,
		components: doc.components.map((c) =>
			c.id === comp.id
				? {
						...c,
						kind: 'resistor',
						value: '1',
						numericValue: 1,
						phaseDeg: undefined,
						unit: 'Ω'
					}
				: c
		)
	};
}

function computePortEquivalent(
	doc: CircuitDocument,
	comp: CircuitComponent,
	origGraph: ReturnType<typeof buildElectricalGraph>,
	origNodeA: string,
	origNodeB: string,
	solveOpts: SolveMnaOptions
): PortEquivalent {
	const baseDoc: CircuitDocument = { ...doc, unknownProblem: undefined };
	const openDoc: CircuitDocument = {
		...baseDoc,
		components: baseDoc.components.filter((c) => c.id !== comp.id)
	};
	const openGraph = buildElectricalGraph(openDoc);
	const openSol = solveMNA(openDoc, solveOpts);
	const shortDoc = replaceWithShortSource(baseDoc, comp);
	const shortSol = solveMNA(shortDoc, solveOpts);

	if (openSol.valid) {
		const openNodeA = mapOriginalNodeToSubGraph(origGraph, openGraph, origNodeA);
		const openNodeB = mapOriginalNodeToSubGraph(origGraph, openGraph, origNodeB);
		if (!openNodeA || !openNodeB) {
			return {
				kind: 'finite',
				error: `Terminals of ${comp.label} became disconnected when opened.`
			};
		}

		const vAOpen = openSol.nodeVoltages[openNodeA]?.voltage ?? Complex.zero();
		const vBOpen = openSol.nodeVoltages[openNodeB]?.voltage ?? Complex.zero();
		const vth = vAOpen.sub(vBOpen);

		// Compute Z_th using 1 A test current source from B -> A on deactivated openDoc
		const deactivatedDoc = buildDeactivatedDocument(openDoc, null);
		const ptA = openGraph.nodes[openNodeA].gridPoints[0];
		const ptB = openGraph.nodes[openNodeB].gridPoints[0];

		const testComp: CircuitComponent = {
			id: '__unknown_thevenin_itest__',
			kind: 'current_source',
			label: 'I_test',
			x: 1000003,
			y: 1000019,
			rotation: 0,
			value: '1',
			phaseDeg: 0
		};
		const testDoc: CircuitDocument = {
			...deactivatedDoc,
			components: [...deactivatedDoc.components, testComp],
			wires: [
				...deactivatedDoc.wires,
				{ id: '__unknown_thevenin_wB__', points: [{ x: 1000001, y: 1000019 }, ptB] },
				{ id: '__unknown_thevenin_wA__', points: [{ x: 1000005, y: 1000019 }, ptA] }
			]
		};
		const testGraph = buildElectricalGraph(testDoc);
		const testSol = solveMNA(testDoc, solveOpts);

		if (!testSol.valid) {
			return {
				kind: 'finite',
				error:
					testSol.diagnostics.find((d) => d.severity === 'error')?.message ??
					`Could not determine Thévenin impedance across ${comp.label}.`
			};
		}

		const [tNodeB, tNodeA] = testGraph.componentNodes[testComp.id];
		const vTestA = testSol.nodeVoltages[tNodeA]?.voltage ?? Complex.zero();
		const vTestB = testSol.nodeVoltages[tNodeB]?.voltage ?? Complex.zero();
		const zth = vTestA.sub(vTestB);

		if (zth.isZero(1e-12)) {
			// Ideal zero-impedance port (e.g. parallel ideal voltage source)
			const refDoc = replaceWithUnitResistor(baseDoc, comp);
			const refSol = solveMNA(refDoc, solveOpts);
			if (!refSol.valid) {
				return {
					kind: 'zero_zth',
					error:
						refSol.diagnostics.find((d) => d.severity === 'error')?.message ??
						'Circuit is unsolvable for finite passive impedance.'
				};
			}
			return {
				kind: 'zero_zth',
				vth,
				zth: Complex.zero(),
				openDoc,
				openGraph,
				openSol,
				refDoc,
				refSol
			};
		}

		if (!shortSol.valid) {
			return {
				kind: 'finite',
				error:
					shortSol.diagnostics.find((d) => d.severity === 'error')?.message ??
					`Circuit becomes invalid when ${comp.label} is shorted.`
			};
		}

		return {
			kind: 'finite',
			vth,
			zth,
			isc: vth.div(zth),
			openDoc,
			openGraph,
			openSol,
			shortDoc,
			shortSol
		};
	}

	// Open-circuit failed (e.g., component in series with an ideal current source -> Z_th = infinity)
	if (shortSol.valid) {
		const refDoc = replaceWithUnitResistor(baseDoc, comp);
		const refSol = solveMNA(refDoc, solveOpts);
		if (refSol.valid) {
			const isc = shortSol.branches[comp.id]?.current ?? Complex.zero();
			return {
				kind: 'inf_zth',
				isc,
				shortDoc,
				shortSol,
				refDoc,
				refSol
			};
		}
	}

	const diag =
		openSol.diagnostics.find((d) => d.severity === 'error')?.message ??
		shortSol.diagnostics.find((d) => d.severity === 'error')?.message ??
		'Circuit topology is invalid.';
	return { kind: 'finite', error: diag };
}

function measureOnOpenCircuit(
	openSol: MnaSolution,
	origGraph: ReturnType<typeof buildElectricalGraph>,
	openGraph: ReturnType<typeof buildElectricalGraph>,
	constraint: CircuitConstraint,
	compId: string,
	vth: Complex
): Complex | null {
	if (constraint.targetId === compId) {
		if (constraint.kind === 'branch_voltage') return vth;
		if (constraint.kind === 'branch_current') return Complex.zero();
		return null;
	}
	if (constraint.kind === 'node_voltage') {
		const mapped = mapOriginalNodeToSubGraph(origGraph, openGraph, constraint.targetId);
		if (!mapped) return null;
		return openSol.nodeVoltages[mapped]?.voltage ?? null;
	}
	return measureConstraint(openSol, constraint);
}

function impedanceToPassiveValue(
	zx: Complex,
	kind: ComponentKind,
	omega: number
): { ok: true; value: number; conversionLatex: string } | { ok: false; error: string } {
	if (!zx.isFinite()) {
		return { ok: false, error: 'Computed required impedance is not finite.' };
	}

	if (kind === 'resistor') {
		const imTol = 1e-6 * Math.max(1, Math.abs(zx.re));
		if (Math.abs(zx.im) > imTol) {
			return {
				ok: false,
				error: `Required impedance Z = ${zx.formatRect(4)} Ω has a non-zero reactive component and cannot be realized by a pure resistor.`
			};
		}
		if (zx.re <= 1e-15) {
			return {
				ok: false,
				error: `Required resistance R = ${formatEngineering(zx.re, 'Ω', 4)} is non-positive; no physical positive resistor achieves this target.`
			};
		}
		return {
			ok: true,
			value: zx.re,
			conversionLatex: `R = ${formatLatexValue(Complex.from(zx.re, 0), 'dc')}\\;\\Omega`
		};
	}

	if (kind === 'inductor') {
		const reTol = 1e-6 * Math.max(1, Math.abs(zx.im));
		if (Math.abs(zx.re) > reTol) {
			return {
				ok: false,
				error: `Required impedance Z = ${zx.formatRect(4)} Ω has a non-zero real (resistive) part and cannot be realized by an ideal inductor.`
			};
		}
		if (zx.im <= 1e-15) {
			return {
				ok: false,
				error: `Required reactance X = ${formatEngineering(zx.im, 'Ω', 4)} is not inductive (requires X > 0); no physical positive inductor achieves this target.`
			};
		}
		const l = zx.im / omega;
		return {
			ok: true,
			value: l,
			conversionLatex: `L = \\frac{X_L}{\\omega} = \\frac{${formatLatexValue(Complex.from(zx.im, 0), 'dc')}}{2\\pi f} = ${formatLatexValue(Complex.from(l, 0), 'dc')}\\text{ H}`
		};
	}

	// Capacitor
	const reTol = 1e-6 * Math.max(1, Math.abs(zx.im));
	if (Math.abs(zx.re) > reTol) {
		return {
			ok: false,
			error: `Required impedance Z = ${zx.formatRect(4)} Ω has a non-zero real (resistive) part and cannot be realized by an ideal capacitor.`
		};
	}
	if (zx.im >= -1e-15) {
		return {
			ok: false,
			error: `Required reactance X = ${formatEngineering(zx.im, 'Ω', 4)} is not capacitive (requires X < 0); no physical positive capacitor achieves this target.`
		};
	}
	const c = -1 / (omega * zx.im);
	return {
		ok: true,
		value: c,
		conversionLatex: `C = \\frac{-1}{\\omega X_C} = ${formatLatexValue(Complex.from(c, 0), 'dc')}\\text{ F}`
	};
}

/**
 * Case B: Unknown passive component (resistor in DC/AC, capacitor or inductor in AC).
 */
function solveUnknownPassive(
	doc: CircuitDocument,
	comp: CircuitComponent,
	problem: UnknownProblemSpec,
	yTarget: Complex,
	solveOpts: SolveMnaOptions
): UnknownSolveResult {
	const mode = doc.mode;
	const frequencyHz = solveOpts.frequencyHz ?? doc.frequencyHz;
	const acMagnitudeMode = solveOpts.acMagnitudeMode ?? doc.acMagnitudeMode ?? 'rms';
	const omega = 2 * Math.PI * frequencyHz;
	const powerScale = mode === 'ac' && acMagnitudeMode === 'peak' ? 0.5 : 1;

	const constraint = problem.constraint;
	const sym = problem.symbol?.trim() || getDefaultUnknownSymbol(comp.kind);
	const symTex = formatSymbolLatex(sym);
	const xUnit = UNIT_BY_KIND[comp.kind] ?? '';
	const ySymTex = getConstraintSymbolLatex(constraint, doc);
	const yUnit = getConstraintUnit(constraint.kind);
	const methodName =
		constraint.kind === 'branch_power'
			? 'Thévenin / Quadratic Power Inversion'
			: 'Thévenin / Möbius Inversion';

	if (mode === 'dc' && comp.kind === 'capacitor') {
		return makeFailure(
			comp,
			problem,
			methodName,
			'Cannot solve for unknown capacitance in DC steady-state: ideal capacitors act as open circuits independent of C. Switch to AC mode to solve for C.'
		);
	}
	if (mode === 'dc' && comp.kind === 'inductor') {
		return makeFailure(
			comp,
			problem,
			methodName,
			'Cannot solve for unknown inductance in DC steady-state: ideal inductors act as short circuits independent of L. Switch to AC mode to solve for L.'
		);
	}

	const origGraph = buildElectricalGraph({ ...doc, unknownProblem: undefined });
	const compNodes = origGraph.componentNodes[comp.id];
	if (!compNodes || compNodes.length < 2) {
		return makeFailure(comp, problem, methodName, `Component "${comp.label}" is not properly connected.`);
	}
	const [origNodeA, origNodeB] = compNodes;
	if (origNodeA === origNodeB) {
		return makeFailure(
			comp,
			problem,
			methodName,
			`${comp.label} is shorted across node ${origNodeA}; its value does not affect the circuit.`
		);
	}

	const port = computePortEquivalent(doc, comp, origGraph, origNodeA, origNodeB, solveOpts);
	if (port.error) {
		return makeFailure(comp, problem, methodName, port.error);
	}

	// Subcase B2: Power constraint (branch_power)
	if (constraint.kind === 'branch_power') {
		const pTarget = yTarget.re;

		// Power on the unknown component itself
		if (constraint.targetId === comp.id) {
			if (comp.kind === 'capacitor' || comp.kind === 'inductor') {
				return makeFailure(
					comp,
					problem,
					methodName,
					'An ideal capacitor or inductor absorbs zero real power (P = 0 W) regardless of its value.'
				);
			}

			if (pTarget < -1e-12) {
				return makeFailure(
					comp,
					problem,
					methodName,
					'A passive resistor cannot supply power (target real power must be positive).'
				);
			}
			if (Math.abs(pTarget) <= 1e-15) {
				return makeFailure(
					comp,
					problem,
					methodName,
					'Zero real power on a loaded resistor requires either an open circuit (R → ∞) or short circuit (R = 0 Ω).'
				);
			}

			if (port.kind === 'zero_zth') {
				const vMagSq = port.vth!.absSq();
				if (vMagSq <= 1e-24) {
					return makeFailure(
						comp,
						problem,
						methodName,
						'Open-circuit voltage across the resistor is 0 V, so power is always 0 W.'
					);
				}
				const rx = (powerScale * vMagSq) / pTarget;
				const cand = verifyCandidate(doc, comp, Complex.from(rx, 0), constraint, yTarget, mode, solveOpts);
				return {
					valid: true,
					componentId: comp.id,
					componentLabel: comp.label,
					componentKind: comp.kind,
					symbol: sym,
					constraint,
					methodName,
					solutions: [cand],
					steps: [
						{
							title: '1. Port Voltage Across Unknown Resistor',
							description: `${comp.label} is connected directly across a zero-impedance port (V_th = ${formatEngineering(port.vth!.abs(), 'V', 4)}).`,
							latex: [
								`P_{${latexSub(comp.label)}}(${symTex}) = ${powerScale === 0.5 ? '\\frac{1}{2}' : ''}\\frac{|V_{th}|^2}{${symTex}} = ${formatLatexValue(Complex.from(pTarget, 0), 'dc')}\\text{ W}`
							]
						},
						{
							title: '2. Exact Solution & MNA Verification',
							description: 'Solved directly for R and verified against full MNA.',
							latex: [
								`${symTex} = ${formatComplexAnswerLatex(cand.value, 'Ω', 'dc')} \\quad (|\\Delta P| = ${formatLatexResidual(cand.discrepancy, 'W')})`
							]
						}
					]
				};
			}

			if (port.kind === 'inf_zth') {
				const iMagSq = port.isc!.absSq();
				if (iMagSq <= 1e-24) {
					return makeFailure(
						comp,
						problem,
						methodName,
						'Forced current through the resistor is 0 A, so power is always 0 W.'
					);
				}
				const rx = pTarget / (powerScale * iMagSq);
				const cand = verifyCandidate(doc, comp, Complex.from(rx, 0), constraint, yTarget, mode, solveOpts);
				return {
					valid: true,
					componentId: comp.id,
					componentLabel: comp.label,
					componentKind: comp.kind,
					symbol: sym,
					constraint,
					methodName,
					solutions: [cand],
					steps: [
						{
							title: '1. Forced Series Current Through Unknown Resistor',
							description: `${comp.label} carries a fixed Norton current I_N = ${formatEngineering(port.isc!.abs(), 'A', 4)}.`,
							latex: [
								`P_{${latexSub(comp.label)}}(${symTex}) = ${powerScale === 0.5 ? '\\frac{1}{2}' : ''}|I_N|^2 ${symTex} = ${formatLatexValue(Complex.from(pTarget, 0), 'dc')}\\text{ W}`
							]
						},
						{
							title: '2. Exact Solution & MNA Verification',
							description: 'Solved directly for R and verified against full MNA.',
							latex: [
								`${symTex} = ${formatComplexAnswerLatex(cand.value, 'Ω', 'dc')} \\quad (|\\Delta P| = ${formatLatexResidual(cand.discrepancy, 'W')})`
							]
						}
					]
				};
			}

			// Finite Z_th = R_th + j X_th
			const vth = port.vth!;
			const zth = port.zth!;
			const rth = zth.re;
			const zthAbsSq = zth.absSq();
			const vMagSq = vth.absSq();

			if (vMagSq <= 1e-24) {
				return makeFailure(
					comp,
					problem,
					methodName,
					`Thévenin voltage across ${comp.label} is 0 V, so power absorbed is always 0 W.`
				);
			}

			const pMax =
				rth + zth.abs() > 1e-15
					? (powerScale * vMagSq) / (2 * (rth + zth.abs()))
					: Infinity;

			const a = pTarget;
			const b = 2 * pTarget * rth - powerScale * vMagSq;
			const c = pTarget * zthAbsSq;

			const rawRoots = solveRealQuadratic(a, b, c).filter((r) => r > 1e-15);
			if (rawRoots.length === 0) {
				return makeFailure(
					comp,
					problem,
					methodName,
					`Target power (${formatEngineering(pTarget, 'W', 4)}) exceeds maximum transferable power P_max = ${formatEngineering(pMax, 'W', 4)} (achieved at R = ${formatEngineering(zth.abs(), 'Ω', 4)}).`
				);
			}

			const roots = dedupeAndSortRoots(rawRoots, false);
			const candidates = roots.map((r) =>
				verifyCandidate(doc, comp, Complex.from(r, 0), constraint, yTarget, mode, solveOpts)
			);

			const zLabel = mode === 'dc' ? 'R_{th}' : 'Z_{th}';
			const steps: SolutionStep[] = [
				{
					title: '1. Thévenin Equivalent Across Unknown Resistor',
					description: `Removed ${comp.label} between nodes ${origNodeA} and ${origNodeB} to obtain the exact Thévenin equivalent.`,
					latex: [
						`V_{th} = ${formatLatexValue(vth, mode)}\\text{ V}, \\quad ${zLabel} = ${formatLatexValue(zth, mode)}\\;\\Omega`,
						`P_{\\max} = ${formatLatexValue(Complex.from(pMax, 0), 'dc')}\\text{ W}`
					],
					highlightIds: [comp.id]
				},
				{
					title: '2. Exact Quadratic Power Equation',
					description: `Setting P(${sym}) = ${formatEngineering(pTarget, 'W', 4)} yields an exact quadratic in ${sym} > 0.`,
					latex: [
						mode === 'dc'
							? `P(${symTex}) = \\frac{V_{th}^2 ${symTex}}{(${symTex} + R_{th})^2} = ${formatLatexValue(Complex.from(pTarget, 0), 'dc')}\\text{ W}`
							: `P(${symTex}) = ${powerScale === 0.5 ? '\\frac{1}{2}' : ''}\\frac{|V_{th}|^2 ${symTex}}{(${symTex} + R_{th})^2 + X_{th}^2} = ${formatLatexValue(Complex.from(pTarget, 0), 'dc')}\\text{ W}`,
						`${formatLatexValue(Complex.from(a, 0), 'dc')}\\,${symTex}^2 + ${formatLatexTerm(Complex.from(b, 0), 'dc')}\\,${symTex} + ${formatLatexTerm(Complex.from(c, 0), 'dc')} = 0`
					]
				},
				{
					title: '3. Positive Roots & MNA Verification',
					description: `Found ${candidates.length} positive physical resistance ${candidates.length === 1 ? 'solution' : 'solutions'} and verified each via full MNA re-solve.`,
					latex: candidates.map((cand, idx) => {
						const name = candidates.length > 1 ? `${symTex}_{${idx + 1}}` : symTex;
						return `${name} = ${formatComplexAnswerLatex(cand.value, 'Ω', 'dc')} \\quad (|\\Delta P| = ${formatLatexResidual(cand.discrepancy, 'W')})`;
					})
				}
			];

			return {
				valid: true,
				componentId: comp.id,
				componentLabel: comp.label,
				componentKind: comp.kind,
				symbol: sym,
				constraint,
				methodName,
				solutions: candidates,
				steps
			};
		}

		// Power on ANOTHER branch b != comp
		const targetComp = doc.components.find((c) => c.id === constraint.targetId);
		if (!targetComp) {
			return makeFailure(comp, problem, methodName, `Target branch "${constraint.targetId}" not found.`);
		}

		let a = 0;
		let b = 0;
		let c = 0;
		let varLatex = symTex;

		if (port.kind === 'finite') {
			const zth = port.zth!;
			const brOpen = port.openSol!.branches[constraint.targetId];
			const brShort = port.shortSol!.branches[constraint.targetId];
			if (!brOpen || !brShort) {
				return makeFailure(comp, problem, methodName, `Target branch "${targetComp.label}" could not be measured.`);
			}

			const vInf = brOpen.voltage;
			const iInf = brOpen.current;
			const v0 = brShort.voltage;
			const i0 = brShort.current;

			if (comp.kind === 'resistor') {
				const Av = vInf;
				const Bv = zth.mul(v0);
				const Ai = iInf;
				const Bi = zth.mul(i0);

				const n2 = powerScale * Av.mul(Ai.conj()).re;
				const n1 = powerScale * (Av.mul(Bi.conj()).re + Bv.mul(Ai.conj()).re);
				const n0 = powerScale * Bv.mul(Bi.conj()).re;

				a = n2 - pTarget;
				b = n1 - 2 * pTarget * zth.re;
				c = n0 - pTarget * zth.absSq();
			} else {
				// Purely reactive unknown Z_x = j X_x
				varLatex = 'X_x';
				const Av = Complex.j(1).mul(vInf);
				const Bv = zth.mul(v0);
				const Ai = Complex.j(1).mul(iInf);
				const Bi = zth.mul(i0);

				const n2 = powerScale * Av.mul(Ai.conj()).re;
				const n1 = powerScale * (Av.mul(Bi.conj()).re + Bv.mul(Ai.conj()).re);
				const n0 = powerScale * Bv.mul(Bi.conj()).re;

				a = n2 - pTarget;
				b = n1 - 2 * pTarget * zth.im;
				c = n0 - pTarget * zth.absSq();
			}
		} else if (port.kind === 'inf_zth') {
			const brShort = port.shortSol!.branches[constraint.targetId];
			const brRef = port.refSol!.branches[constraint.targetId];
			if (!brShort || !brRef) {
				return makeFailure(comp, problem, methodName, `Target branch "${targetComp.label}" could not be measured.`);
			}
			const v0 = brShort.voltage;
			const i0 = brShort.current;
			const mv = brRef.voltage.sub(v0);
			const mi = brRef.current.sub(i0);
			const Av = comp.kind === 'resistor' ? mv : Complex.j(1).mul(mv);
			const Ai = comp.kind === 'resistor' ? mi : Complex.j(1).mul(mi);
			if (comp.kind !== 'resistor') varLatex = 'X_x';
			a = powerScale * Av.mul(Ai.conj()).re;
			b = powerScale * (Av.mul(i0.conj()).re + v0.mul(Ai.conj()).re);
			c = powerScale * v0.mul(i0.conj()).re - pTarget;
		} else {
			// zero_zth: y(Z_x) = y_inf + c_y / Z_x
			const brOpen = port.openSol!.branches[constraint.targetId];
			const brRef = port.refSol!.branches[constraint.targetId];
			if (!brOpen || !brRef) {
				return makeFailure(comp, problem, methodName, `Target branch "${targetComp.label}" could not be measured.`);
			}
			const vInf = brOpen.voltage;
			const iInf = brOpen.current;
			const cv = brRef.voltage.sub(vInf);
			const ci = brRef.current.sub(iInf);
			// Multiply through by |Z_x|^2
			if (comp.kind === 'resistor') {
				a = powerScale * vInf.mul(iInf.conj()).re - pTarget;
				b = powerScale * (vInf.mul(ci.conj()).re + cv.mul(iInf.conj()).re);
				c = powerScale * cv.mul(ci.conj()).re;
			} else {
				varLatex = 'X_x';
				const Av = Complex.j(1).mul(vInf);
				const Ai = Complex.j(1).mul(iInf);
				a = powerScale * Av.mul(Ai.conj()).re - pTarget;
				b = powerScale * (Av.mul(ci.conj()).re + cv.mul(Ai.conj()).re);
				c = powerScale * cv.mul(ci.conj()).re;
			}
		}

		const rawRoots = solveRealQuadratic(a, b, c);
		const physicalValues: number[] = [];
		for (const r of rawRoots) {
			if (comp.kind === 'resistor' && r > 1e-15) {
				physicalValues.push(r);
			} else if (comp.kind === 'inductor' && r > 1e-15) {
				physicalValues.push(r / omega);
			} else if (comp.kind === 'capacitor' && r < -1e-15) {
				physicalValues.push(-1 / (omega * r));
			}
		}

		const sorted = dedupeAndSortRoots(physicalValues, false);
		if (sorted.length === 0) {
			return makeFailure(
				comp,
				problem,
				methodName,
				`No positive physical ${comp.kind} value achieves P(${targetComp.label}) = ${formatEngineering(pTarget, 'W', 4)}.`
			);
		}

		const candidates = sorted.map((val) =>
			verifyCandidate(doc, comp, Complex.from(val, 0), constraint, yTarget, mode, solveOpts)
		);

		const steps: SolutionStep[] = [
			{
				title: '1. Möbius Power Relation',
				description: `Expressed voltage and current of branch ${targetComp.label} via the port Thévenin equivalent seen by ${comp.label}.`,
				latex: [
					port.vth && port.zth
						? `V_{th} = ${formatLatexValue(port.vth, mode)}\\text{ V}, \\quad Z_{th} = ${formatLatexValue(port.zth, mode)}\\;\\Omega`
						: `P_{${latexSub(targetComp.label)}}(${symTex}) = ${formatLatexValue(Complex.from(pTarget, 0), 'dc')}\\text{ W}`
				],
				highlightIds: [comp.id, constraint.targetId]
			},
			{
				title: '2. Exact Quadratic Equation',
				description: `Equating P(${targetComp.label}) = ${formatEngineering(pTarget, 'W', 4)} produces an exact quadratic.`,
				latex: [
					`${formatLatexValue(Complex.from(a, 0), 'dc')}\\,${varLatex}^2 + ${formatLatexTerm(Complex.from(b, 0), 'dc')}\\,${varLatex} + ${formatLatexTerm(Complex.from(c, 0), 'dc')} = 0`
				]
			},
			{
				title: '3. Positive Solutions & MNA Verification',
				description: `Filtered to strictly positive physical values and verified via full MNA re-solve.`,
				latex: candidates.map((cand, idx) => {
					const name = candidates.length > 1 ? `${symTex}_{${idx + 1}}` : symTex;
					return `${name} = ${formatComplexAnswerLatex(cand.value, xUnit, 'dc')} \\quad (|\\Delta P| = ${formatLatexResidual(cand.discrepancy, 'W')})`;
				})
			}
		];

		return {
			valid: true,
			componentId: comp.id,
			componentLabel: comp.label,
			componentKind: comp.kind,
			symbol: sym,
			constraint,
			methodName,
			solutions: candidates,
			steps
		};
	}

	// Subcase B1: Linear constraint (node_voltage, branch_voltage, branch_current)
	let zx: Complex;
	const steps: SolutionStep[] = [];
	const yTargetTex = appendLatexSubscript(ySymTex, 'target');

	if (port.kind === 'finite') {
		const vth = port.vth!;
		const zth = port.zth!;
		const yInf = measureOnOpenCircuit(
			port.openSol!,
			origGraph,
			port.openGraph!,
			constraint,
			comp.id,
			vth
		);
		const y0 = measureConstraint(port.shortSol!, constraint);

		if (!yInf || !y0) {
			return makeFailure(
				comp,
				problem,
				methodName,
				`Target measurement "${constraint.targetId}" could not be evaluated.`
			);
		}

		const span = yInf.sub(y0).abs();
		if (span < 1e-14 * Math.max(1, yInf.abs(), y0.abs())) {
			return makeFailure(
				comp,
				problem,
				methodName,
				'The measured quantity is independent of this passive element (sensitivity = 0).'
			);
		}

		const denom = yInf.sub(yTarget);
		if (denom.abs() < 1e-14 * Math.max(1, yInf.abs(), yTarget.abs())) {
			return makeFailure(
				comp,
				problem,
				methodName,
				'The target value corresponds to an open circuit (Z → ∞); no finite passive value achieves it.'
			);
		}

		const numerDiff = yTarget.sub(y0);
		if (numerDiff.abs() < 1e-14 * Math.max(1, y0.abs(), yTarget.abs())) {
			return makeFailure(
				comp,
				problem,
				methodName,
				'The target value corresponds to a short circuit (Z = 0 Ω); no strictly positive passive value achieves it.'
			);
		}

		zx = zth.mul(numerDiff).div(denom);

		const zLabel = mode === 'dc' ? 'R_{th}' : 'Z_{th}';
		const zxLabel = mode === 'dc' ? symTex : 'Z_x';
		steps.push(
			{
				title: '1. Thévenin Equivalent Seen by Unknown Element',
				description: `Removed ${comp.label} between nodes ${origNodeA} and ${origNodeB} and solved for V_th and ${mode === 'dc' ? 'R_th' : 'Z_th'}.`,
				latex: [
					`V_{th} = ${formatLatexValue(vth, mode)}\\text{ V}, \\quad ${zLabel} = ${formatLatexValue(zth, mode)}\\;\\Omega`
				],
				highlightIds: [comp.id]
			},
			{
				title: '2. Open-Circuit & Short-Circuit Responses',
				description: `Evaluated ${formatConstraintQuantityProse(constraint, doc)} with ${comp.label} open-circuited (Z → ∞) and short-circuited (Z = 0).`,
				latex: [
					`${ySymTex}(\\infty) = ${formatLatexValue(yInf, mode)}\\text{ ${yUnit}}, \\quad ${ySymTex}(0) = ${formatLatexValue(y0, mode)}\\text{ ${yUnit}}`,
					`${ySymTex}(${zxLabel}) = \\frac{${ySymTex}(\\infty)\\,${zxLabel} + ${zLabel}\\,${ySymTex}(0)}{${zxLabel} + ${zLabel}}`
				],
				highlightIds:
					constraint.kind === 'node_voltage' ? [comp.id] : [comp.id, constraint.targetId]
			},
			{
				title: '3. Exact Möbius Inversion',
				description: `Solved the Möbius identity directly for the required impedance ${mode === 'dc' ? sym : 'Z_x'}.`,
				latex: [
					`${zxLabel} = \\frac{${zLabel}\\,(${yTargetTex} - ${ySymTex}(0))}{${ySymTex}(\\infty) - ${yTargetTex}} = ${formatLatexValue(zx, mode)}\\;\\Omega`
				]
			}
		);
	} else if (port.kind === 'inf_zth') {
		// y(Z_x) = y_0 + m * Z_x (ideal current source in series with unknown passive)
		const y0 = measureConstraint(port.shortSol!, constraint);
		const yRef = measureConstraint(port.refSol!, constraint);
		if (!y0 || !yRef) {
			return makeFailure(
				comp,
				problem,
				methodName,
				`Target measurement "${constraint.targetId}" could not be evaluated.`
			);
		}
		const m = yRef.sub(y0); // Z_ref = 1 Ω
		if (m.abs() < 1e-14) {
			return makeFailure(
				comp,
				problem,
				methodName,
				'The measured quantity is independent of this passive element (sensitivity = 0).'
			);
		}
		zx = yTarget.sub(y0).div(m);
		steps.push(
			{
				title: '1. Norton Current-Fed Port Model (Z_th → ∞)',
				description: `${comp.label} is in series with an ideal current source, so the response is strictly affine in Z_x.`,
				latex: [
					`${ySymTex}(Z_x) = ${ySymTex}(0) + m\\,Z_x`,
					`Z_x = \\frac{${yTargetTex} - ${ySymTex}(0)}{m} = ${formatLatexValue(zx, mode)}\\;\\Omega`
				],
				highlightIds: [comp.id]
			}
		);
	} else {
		// zero_zth: y(Z_x) = y_inf + c / Z_x (ideal voltage source directly across unknown passive)
		const yInf = measureOnOpenCircuit(
			port.openSol!,
			origGraph,
			port.openGraph!,
			constraint,
			comp.id,
			port.vth!
		);
		const yRef = measureConstraint(port.refSol!, constraint);
		if (!yInf || !yRef) {
			return makeFailure(
				comp,
				problem,
				methodName,
				`Target measurement "${constraint.targetId}" could not be evaluated.`
			);
		}
		const coeff = yRef.sub(yInf); // Z_ref = 1 Ω
		if (coeff.abs() < 1e-14) {
			return makeFailure(
				comp,
				problem,
				methodName,
				'The measured quantity is independent of this passive element (sensitivity = 0).'
			);
		}
		const diff = yTarget.sub(yInf);
		if (diff.abs() < 1e-14 * Math.max(1, yInf.abs(), yTarget.abs())) {
			return makeFailure(
				comp,
				problem,
				methodName,
				'The target value corresponds to an open circuit (Z → ∞); no finite passive value achieves it.'
			);
		}
		zx = coeff.div(diff);
		steps.push(
			{
				title: '1. Ideal Voltage-Fed Port Model (Z_th = 0)',
				description: `${comp.label} is connected directly across a zero-impedance voltage port, so the response is affine in admittance 1/Z_x.`,
				latex: [
					`${ySymTex}(Z_x) = ${ySymTex}(\\infty) + \\frac{c}{Z_x}`,
					`Z_x = \\frac{c}{${yTargetTex} - ${ySymTex}(\\infty)} = ${formatLatexValue(zx, mode)}\\;\\Omega`
				],
				highlightIds: [comp.id]
			}
		);
	}

	const physical = impedanceToPassiveValue(zx, comp.kind, omega);
	if (!physical.ok) {
		return makeFailure(comp, problem, methodName, physical.error, steps);
	}

	const candidate = verifyCandidate(
		doc,
		comp,
		Complex.from(physical.value, 0),
		constraint,
		yTarget,
		mode,
		solveOpts
	);

	steps.push({
		title: `${steps.length + 1}. Physical Component Value & MNA Verification`,
		description: `Converted required impedance into the physical ${comp.kind} value and verified via full MNA re-solve.`,
		latex: [
			...(comp.kind !== 'resistor' ? [physical.conversionLatex] : []),
			`${symTex} = ${formatComplexAnswerLatex(candidate.value, xUnit, 'dc')}`,
			`|${ySymTex}(${symTex}) - ${yTargetTex}| = ${formatLatexResidual(candidate.discrepancy, yUnit)}`
		]
	});

	return {
		valid: true,
		componentId: comp.id,
		componentLabel: comp.label,
		componentKind: comp.kind,
		symbol: sym,
		constraint,
		methodName,
		solutions: [candidate],
		steps
	};
}

/**
 * Solves an inverse / unknown-value circuit problem exactly and verifies
 * every candidate solution against full MNA.
 */
export function solveUnknownParameter(
	doc: CircuitDocument,
	problem: UnknownProblemSpec,
	options?: SolveMnaOptions
): UnknownSolveResult {
	const mode = doc.mode;
	const solveOpts: SolveMnaOptions = {
		frequencyHz: options?.frequencyHz ?? doc.frequencyHz,
		acMagnitudeMode: options?.acMagnitudeMode ?? doc.acMagnitudeMode ?? 'rms'
	};

	const comp = doc.components.find((c) => c.id === problem.componentId);
	if (!comp) {
		return makeFailure(
			undefined,
			problem,
			'Unknown Parameter Solver',
			`Unknown component "${problem.componentId}" was not found in the circuit.`
		);
	}

	if (!SOLVABLE_KINDS.has(comp.kind)) {
		return makeFailure(
			comp,
			problem,
			'Unknown Parameter Solver',
			`Component "${comp.label}" (${comp.kind}) does not have a solvable electrical parameter.`
		);
	}

	const methodName = SOURCE_KINDS.has(comp.kind)
		? 'Linearity / Superposition'
		: 'Thévenin / Möbius Inversion';

	const { constraint } = problem;
	const rawVal = constraint.value?.trim() ?? '';
	if (!rawVal) {
		return makeFailure(comp, problem, methodName, 'Enter a target measurement value.');
	}

	let yTarget: Complex;
	if (constraint.kind === 'branch_power') {
		const pNum = parseEngineeringNumber(rawVal);
		if (pNum === null || !Number.isFinite(pNum)) {
			return makeFailure(
				comp,
				problem,
				methodName,
				`Invalid target power "${constraint.value}" (enter a real power in W, e.g. 12m, 2.5).`
			);
		}
		yTarget = Complex.from(pNum, 0);
	} else {
		const parsed = parseComplexValue(rawVal);
		if (!parsed || !parsed.isFinite()) {
			return makeFailure(
				comp,
				problem,
				methodName,
				`Invalid target measurement value "${constraint.value}".`
			);
		}
		if (mode === 'dc' && !parsed.isReal(1e-12)) {
			return makeFailure(
				comp,
				problem,
				methodName,
				`Complex target "${constraint.value}" is not valid in DC mode. Switch to AC mode or enter a real scalar.`
			);
		}
		yTarget = mode === 'dc' ? Complex.from(parsed.re, 0) : parsed;
	}

	// Validate target node / branch existence before solving
	if (constraint.kind === 'node_voltage') {
		if (constraint.targetId === '0') {
			return makeFailure(
				comp,
				problem,
				methodName,
				'Reference node 0 (GND) is fixed at 0 V and cannot constrain an unknown value.'
			);
		}
		const graph = buildElectricalGraph({ ...doc, unknownProblem: undefined });
		if (!graph.nodes[constraint.targetId]) {
			return makeFailure(
				comp,
				problem,
				methodName,
				`Target node "${constraint.targetId}" does not exist in the circuit.`
			);
		}
	} else {
		const targetComp = doc.components.find((c) => c.id === constraint.targetId);
		if (!targetComp || targetComp.kind === 'ground' || targetComp.kind === 'terminal') {
			return makeFailure(
				comp,
				problem,
				methodName,
				`Target branch component "${constraint.targetId}" was not found.`
			);
		}
	}

	if (SOURCE_KINDS.has(comp.kind)) {
		return solveUnknownSource(doc, comp, problem, yTarget, solveOpts);
	}
	return solveUnknownPassive(doc, comp, problem, yTarget, solveOpts);
}
