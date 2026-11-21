/**
 * Method 4: Superposition Theorem Solver.
 *
 * Deactivates all independent sources except one at a time (voltage sources -> 0 V short,
 * current sources -> open circuit), solves each sub-circuit independently, and combines:
 *   - Same-frequency DC / single-frequency AC: complex sum verified against MNA (< 1e-8).
 *   - Multi-frequency AC: per-frequency phasors + time-domain sinusoid sum & RMS effective value.
 */

import { Complex } from '../complex';
import { buildElectricalGraph, parseSourceValue } from '../graph';
import { solveMNA } from '../mna';
import type {
	CircuitComponent,
	CircuitDocument,
	MethodResult,
	MnaSolution,
	SolutionStep
} from '../types';
import {
	buildDeactivatedDocument,
	formatLatexValue,
	latexSub,
	verifyAgainstMna
} from './shared';

function mapSubNodesToOriginal(
	origGraph: ReturnType<typeof buildElectricalGraph>,
	subGraph: ReturnType<typeof buildElectricalGraph>,
	subSol: MnaSolution
): Record<string, Complex> {
	const mapped: Record<string, Complex> = {};
	for (const [origNodeId, origNode] of Object.entries(origGraph.nodes)) {
		if (origNodeId === '0') {
			mapped[origNodeId] = Complex.zero();
			continue;
		}
		// Match by any shared grid point or component pin
		let foundVoltage: Complex | undefined;
		for (const pin of origNode.componentPins) {
			const subCompNodes = subGraph.componentNodes[pin.componentId];
			if (subCompNodes && subCompNodes[pin.pinIndex]) {
				const subNid = subCompNodes[pin.pinIndex];
				foundVoltage = subSol.nodeVoltages[subNid]?.voltage;
				if (foundVoltage) break;
			}
		}
		if (!foundVoltage && origNode.gridPoints.length > 0) {
			const gp = origNode.gridPoints[0];
			for (const [subNid, subNode] of Object.entries(subGraph.nodes)) {
				if (subNode.gridPoints.some((p) => p.x === gp.x && p.y === gp.y)) {
					foundVoltage = subSol.nodeVoltages[subNid]?.voltage;
					break;
				}
			}
		}
		mapped[origNodeId] = foundVoltage ?? Complex.zero();
	}
	return mapped;
}

export function solveSuperposition(doc: CircuitDocument, mna: MnaSolution): MethodResult {
	const title = 'Superposition Theorem';
	if (!mna.valid) {
		return {
			methodId: 'superposition',
			title,
			applicable: false,
			inapplicableReason: 'Circuit has topology or value errors; fix validation errors first.',
			steps: []
		};
	}

	const origGraph = buildElectricalGraph(doc);
	const sources: CircuitComponent[] = doc.components.filter(
		(c) => c.kind === 'voltage_source' || c.kind === 'current_source'
	);

	if (sources.length === 0) {
		return {
			methodId: 'superposition',
			title,
			applicable: true,
			steps: [
				{
					title: 'No Independent Sources',
					description:
						'The circuit contains zero independent sources, so all node voltages and branch currents are 0.',
					latex: ['V_n = 0\\text{ V},\\quad I_b = 0\\text{ A}']
				}
			],
			summaryLatex: 'V_n = 0\\text{ V}',
			verifiedAgainstMna: true,
			maxDiscrepancy: 0
		};
	}

	const sourceFreq = (s: CircuitComponent): number =>
		mna.mode === 'dc' ? 0 : s.frequencyHz ?? mna.frequencyHz;

	const distinctFreqs = new Set(sources.map(sourceFreq));
	const isMultiFreq = mna.mode === 'ac' && distinctFreqs.size > 1;

	const twoTerminal = doc.components.filter(
		(c) => c.kind !== 'ground' && c.kind !== 'terminal'
	);

	const totalNodeV: Record<string, Complex> = {};
	for (const nid of Object.keys(origGraph.nodes)) totalNodeV[nid] = Complex.zero();
	const totalBranchV: Record<string, Complex> = {};
	const totalBranchI: Record<string, Complex> = {};
	for (const comp of twoTerminal) {
		totalBranchV[comp.id] = Complex.zero();
		totalBranchI[comp.id] = Complex.zero();
	}

	const steps: SolutionStep[] = [
		{
			title: '1. Identify Independent Sources',
			description: `Found ${sources.length} independent source(s). Solve one source at a time while zeroing other voltage sources (short circuit) and opening other current sources.`,
			latex: sources.map((s) => {
				const subMode = sourceFreq(s) === 0 ? 'dc' : mna.mode;
				const val = parseSourceValue(s, subMode)!;
				const sym = s.kind === 'voltage_source' ? 'V' : 'I';
				const unit = s.kind === 'voltage_source' ? 'V' : 'A';
				const fNote = isMultiFreq ? `\\;(f = ${sourceFreq(s)}\\text{ Hz})` : '';
				return `${sym}_{${latexSub(s.label)}} = ${formatLatexValue(val, subMode)}\\text{ ${unit}}${fNote}`;
			})
		}
	];

	// Per-frequency phasors for multi-frequency AC time-domain synthesis
	const perFreqNodePhasors = new Map<number, Record<string, Complex>>();
	let multiFreqMaxSubDiscrepancy = 0;

	for (let k = 0; k < sources.length; k++) {
		const activeSrc = sources[k];
		const fK = sourceFreq(activeSrc);
		const subMode = mna.mode === 'ac' && fK === 0 ? 'dc' : mna.mode;
		const subDoc = buildDeactivatedDocument(
			doc,
			activeSrc.id,
			subMode,
			subMode === 'dc' ? doc.frequencyHz : fK
		);
		const subGraph = buildElectricalGraph(subDoc);
		const subSol = solveMNA(subDoc, {
			frequencyHz: subDoc.frequencyHz,
			acMagnitudeMode: mna.acMagnitudeMode
		});

		if (!subSol.valid) {
			return {
				methodId: 'superposition',
				title,
				applicable: false,
				inapplicableReason: `Sub-circuit with only ${activeSrc.label} active could not be solved (${subSol.diagnostics.find((d) => d.severity === 'error')?.message ?? 'singular'}).`,
				steps
			};
		}

		const subNodesMapped = mapSubNodesToOriginal(origGraph, subGraph, subSol);

		if (isMultiFreq) {
			if (!perFreqNodePhasors.has(fK)) {
				const initMap: Record<string, Complex> = {};
				for (const nid of Object.keys(origGraph.nodes)) initMap[nid] = Complex.zero();
				perFreqNodePhasors.set(fK, initMap);
			}
			const freqBucket = perFreqNodePhasors.get(fK)!;
			for (const nid of origGraph.nonRefNodeIds) {
				freqBucket[nid] = freqBucket[nid].add(subNodesMapped[nid]);
			}
			// Verify sub-circuit against its own MNA solve
			if (!subSol.powerBalance.balanced) {
				multiFreqMaxSubDiscrepancy = Math.max(
					multiFreqMaxSubDiscrepancy,
					Math.abs(subSol.powerBalance.totalRealPower)
				);
			}
		} else {
			for (const nid of origGraph.nonRefNodeIds) {
				totalNodeV[nid] = totalNodeV[nid].add(subNodesMapped[nid]);
			}
			for (const comp of twoTerminal) {
				const [nA, nB] = origGraph.componentNodes[comp.id];
				const brSub = subSol.branches[comp.id];
				const vSub = brSub
					? brSub.voltage
					: subNodesMapped[nA].sub(subNodesMapped[nB]);
				const iSub = brSub ? brSub.current : Complex.zero();
				totalBranchV[comp.id] = totalBranchV[comp.id].add(vSub);
				totalBranchI[comp.id] = totalBranchI[comp.id].add(iSub);
			}
		}

		const contribLatex = origGraph.nonRefNodeIds.map(
			(nid) =>
				`V_{${nid}}^{(${k + 1})} = ${formatLatexValue(subNodesMapped[nid], subMode)}\\text{ V}`
		);
		const branchContribLatex = twoTerminal.slice(0, 4).map((c) => {
			const br = subSol.branches[c.id];
			const iVal = br ? br.current : Complex.zero();
			return `I_{${latexSub(c.label)}}^{(${k + 1})} = ${formatLatexValue(iVal, subMode)}\\text{ A}`;
		});

		steps.push({
			title: `${k + 2}. Contribution of ${activeSrc.label} Alone`,
			description: `Keep ${activeSrc.label} active${isMultiFreq ? ` at f = ${fK} Hz` : ''}; deactivate all other independent sources.`,
			latex: [...contribLatex, ...branchContribLatex],
			highlightIds: [activeSrc.id]
		});
	}

	if (isMultiFreq) {
		const peakScale = mna.acMagnitudeMode === 'rms' ? Math.SQRT2 : 1;
		const rmsScale = mna.acMagnitudeMode === 'rms' ? 1 : 1 / Math.SQRT2;
		const timeDomainLatex: string[] = [];

		for (const nid of origGraph.nonRefNodeIds) {
			const terms: string[] = [];
			let rmsSqSum = 0;

			for (const [fK, nodeMap] of perFreqNodePhasors.entries()) {
				const phasor = nodeMap[nid];
				if (phasor.isZero(1e-12)) continue;

				if (fK === 0) {
					terms.push(formatLatexValue(phasor, 'dc'));
					rmsSqSum += phasor.re * phasor.re;
				} else {
					const amp = phasor.abs() * peakScale;
					const deg = phasor.argDeg();
					const omega = 2 * Math.PI * fK;
					const ampStr = formatLatexValue(Complex.from(amp, 0), 'ac');
					const wStr = formatLatexValue(Complex.from(omega, 0), 'ac');
					const degStr = formatLatexValue(Complex.from(deg, 0), 'ac');
					const phasePart =
						Math.abs(deg) < 1e-9
							? ''
							: deg >= 0
								? ` + ${degStr}^\\circ`
								: ` - ${formatLatexValue(Complex.from(-deg, 0), 'ac')}^\\circ`;
					terms.push(`${ampStr}\\cos(${wStr}t${phasePart})`);
					const rmsMag = phasor.abs() * rmsScale;
					rmsSqSum += rmsMag * rmsMag;
				}
			}

			const rmsTotal = Math.sqrt(rmsSqSum);
			const rhsExpr = terms.join(' + ') || '0';
			timeDomainLatex.push(
				`v_{${nid}}(t) = ${rhsExpr}\\text{ V},\\quad V_{${nid},\\text{rms}} = ${formatLatexValue(Complex.from(rmsTotal, 0), 'ac')}\\text{ V}`
			);
		}

		steps.push({
			title: `${sources.length + 2}. Multi-Frequency Time-Domain Combination`,
			description:
				'Phasors at different frequencies cannot be added directly; combine each frequency component in the time domain and compute true RMS.',
			latex: timeDomainLatex
		});

		return {
			methodId: 'superposition',
			title,
			applicable: true,
			steps,
			summaryLatex: timeDomainLatex.slice(0, 3).join(' \\\\ '),
			verifiedAgainstMna: multiFreqMaxSubDiscrepancy < 1e-8,
			maxDiscrepancy: multiFreqMaxSubDiscrepancy
		};
	}

	// Same-frequency combination & MNA cross-verification
	const sumLatex = [
		...origGraph.nonRefNodeIds.map(
			(nid) => `V_{${nid}} = \\sum_k V_{${nid}}^{(k)} = ${formatLatexValue(totalNodeV[nid], mna.mode)}\\text{ V}`
		),
		...twoTerminal.slice(0, 4).map(
			(c) =>
				`I_{${latexSub(c.label)}} = \\sum_k I_{${latexSub(c.label)}}^{(k)} = ${formatLatexValue(totalBranchI[c.id], mna.mode)}\\text{ A}`
		)
	];

	steps.push({
		title: `${sources.length + 2}. Superposition Sum`,
		description: 'Sum individual source responses to obtain total node voltages and branch currents.',
		latex: sumLatex
	});

	const verification = verifyAgainstMna(mna, {
		nodeVoltages: totalNodeV,
		branchVoltages: totalBranchV,
		branchCurrents: totalBranchI
	});

	return {
		methodId: 'superposition',
		title,
		applicable: true,
		steps,
		summaryLatex: sumLatex.slice(0, 4).join(' \\\\ '),
		...verification
	};
}
