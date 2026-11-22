/**
 * Shared utilities for Circuit Lab's pedagogical method solvers:
 * LaTeX value formatting, impedance/admittance evaluation, source deactivation,
 * and cross-verification against MNA ground truth.
 */

import { Complex, formatRational } from '../complex';
import { getPassiveImpedance as resolvePassiveImpedance } from '../graph';
import type {
	AnalysisMode,
	CircuitComponent,
	CircuitDocument,
	MnaSolution
} from '../types';

export const MNA_VERIFICATION_TOL = 1e-8;

/**
 * Formats a complex or real scalar for clean KaTeX display.
 * In DC mode, uses exact rational fractions (e.g. `\frac{10}{3}`) when applicable.
 */
export function formatLatexValue(c: Complex, mode: AnalysisMode, prec = 4): string {
	if (c.isZero(1e-12)) return '0';
	if (mode === 'dc' || c.isReal(1e-12)) {
		const rat = formatRational(c.re);
		if (rat) {
			if (rat.includes('/')) {
				const neg = rat.startsWith('-');
				const [num, den] = (neg ? rat.slice(1) : rat).split('/');
				return `${neg ? '-' : ''}\\frac{${num}}{${den}}`;
			}
			return rat;
		}
		return Complex.from(c.re, 0).toLatexRect(prec);
	}
	return c.toLatexRect(prec);
}

/**
 * Formats a complex number wrapped in parentheses if it has both real and imaginary parts
 * or is negative, for clean equation substitution.
 */
export function formatLatexTerm(c: Complex, mode: AnalysisMode, prec = 4): string {
	const s = formatLatexValue(c, mode, prec);
	if (s.startsWith('-') || (!c.isReal(1e-12) && Math.abs(c.re) > 1e-12)) {
		return `(${s})`;
	}
	return s;
}

/**
 * Computes the complex impedance Z of a passive component in DC or AC mode.
 * Returns `null` for ideal sources and DC open capacitors; `0` for DC shorted inductors.
 */
export function getPassiveImpedance(
	comp: CircuitComponent,
	mode: AnalysisMode,
	frequencyHz: number
): Complex | null {
	const res = resolvePassiveImpedance(comp, mode, frequencyHz);
	if (!res) return null;
	if (res.kind === 'impedance') return res.z;
	if (res.kind === 'short') return Complex.zero();
	return null;
}

/**
 * Computes the complex admittance Y of a passive component in DC or AC mode.
 * Returns `null` for ideal sources and DC shorted inductors; `0` for DC open capacitors.
 */
export function getPassiveAdmittance(
	comp: CircuitComponent,
	mode: AnalysisMode,
	frequencyHz: number
): Complex | null {
	const res = resolvePassiveImpedance(comp, mode, frequencyHz);
	if (!res) return null;
	if (res.kind === 'impedance') return Complex.one().div(res.z);
	if (res.kind === 'open') return Complex.zero();
	return null;
}

/**
 * Creates a modified CircuitDocument with all independent sources deactivated
 * except `keepSourceId` (if provided).
 * - Other voltage sources become 0 V short circuits.
 * - Other current sources are removed (open circuits).
 */
export function buildDeactivatedDocument(
	doc: CircuitDocument,
	keepSourceId: string | null,
	overrideMode?: AnalysisMode,
	overrideFrequencyHz?: number
): CircuitDocument {
	const components: CircuitComponent[] = [];
	for (const comp of doc.components) {
		if (comp.id === keepSourceId) {
			components.push({ ...comp });
			continue;
		}
		if (comp.kind === 'voltage_source') {
			components.push({
				...comp,
				value: '0',
				numericValue: 0,
				phaseDeg: 0
			});
			continue;
		}
		if (comp.kind === 'current_source') {
			// Deactivated current source is an open circuit -> omit from sub-circuit
			continue;
		}
		components.push({ ...comp });
	}

	return {
		...doc,
		mode: overrideMode ?? doc.mode,
		frequencyHz: overrideFrequencyHz ?? doc.frequencyHz,
		components
	};
}

/**
 * Cross-verifies independently solved node voltages and branch voltages/currents
 * against the MNA ground-truth solution.
 */
export function verifyAgainstMna(
	mna: MnaSolution,
	solved: {
		nodeVoltages?: Record<string, Complex>;
		branchVoltages?: Record<string, Complex>;
		branchCurrents?: Record<string, Complex>;
	}
): { verifiedAgainstMna: boolean; maxDiscrepancy: number } {
	if (!mna.valid) {
		return { verifiedAgainstMna: false, maxDiscrepancy: Infinity };
	}

	let maxDiscrepancy = 0;

	if (solved.nodeVoltages) {
		for (const [nodeId, nodeRes] of Object.entries(mna.nodeVoltages)) {
			const candidate = solved.nodeVoltages[nodeId];
			if (candidate) {
				const diff = candidate.sub(nodeRes.voltage).abs();
				if (diff > maxDiscrepancy) maxDiscrepancy = diff;
			}
		}
	}

	if (solved.branchVoltages) {
		for (const [compId, br] of Object.entries(mna.branches)) {
			const candidate = solved.branchVoltages[compId];
			if (candidate) {
				const diff = candidate.sub(br.voltage).abs();
				if (diff > maxDiscrepancy) maxDiscrepancy = diff;
			}
		}
	}

	if (solved.branchCurrents) {
		for (const [compId, br] of Object.entries(mna.branches)) {
			const candidate = solved.branchCurrents[compId];
			if (candidate) {
				const diff = candidate.sub(br.current).abs();
				if (diff > maxDiscrepancy) maxDiscrepancy = diff;
			}
		}
	}

	return {
		verifiedAgainstMna: Number.isFinite(maxDiscrepancy) && maxDiscrepancy < MNA_VERIFICATION_TOL,
		maxDiscrepancy
	};
}

/**
 * Sanitizes component labels for clean LaTeX subscripts.
 */
export function latexSub(label: string): string {
	return label.replace(/[^a-zA-Z0-9_]/g, '');
}
