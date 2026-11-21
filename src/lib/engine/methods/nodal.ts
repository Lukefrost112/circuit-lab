/**
 * Method 2: Nodal Analysis (with Known-Node Identification & Supernodes).
 *
 * Independently identifies:
 *   1. Reference node "0"
 *   2. Nodes whose voltage is directly fixed by voltage-constraint branches connected to "0"
 *   3. Supernodes formed by floating voltage sources (and DC inductors) between non-reference nodes
 *
 * Assembles and solves the reduced nodal linear system A * V = b (without MNA current rows),
 * recovers voltage-source currents via topological leaf-peeling, and cross-verifies against MNA.
 */

import { Complex } from '../complex';
import { buildElectricalGraph, parseSourceValue } from '../graph';
import { matrixToLatex, solveComplexLinearSystem } from '../linalg';
import type {
	CircuitComponent,
	CircuitDocument,
	MethodResult,
	MnaSolution,
	SolutionStep
} from '../types';
import {
	formatLatexTerm,
	formatLatexValue,
	getPassiveAdmittance,
	latexSub,
	verifyAgainstMna
} from './shared';

interface ConstraintBranch {
	comp: CircuitComponent;
	nodeA: string;
	nodeB: string;
	voltage: Complex;
}

export function solveNodal(doc: CircuitDocument, mna: MnaSolution): MethodResult {
	const title = 'Nodal Analysis';
	if (!mna.valid) {
		return {
			methodId: 'nodal',
			title,
			applicable: false,
			inapplicableReason: 'Circuit has topology or value errors; fix validation errors first.',
			steps: []
		};
	}

	const graph = buildElectricalGraph(doc);
	const mode = mna.mode;
	const freq = mna.frequencyHz;
	const nonRefNodes = graph.nonRefNodeIds;

	const twoTerminal = doc.components.filter(
		(c) => c.kind !== 'ground' && c.kind !== 'terminal'
	);

	// Identify voltage-constraint branches (voltage sources + DC shorted inductors)
	const constraintBranches: ConstraintBranch[] = [];
	const nonConstraintBranches: CircuitComponent[] = [];

	for (const comp of twoTerminal) {
		if (comp.kind === 'voltage_source' || (mode === 'dc' && comp.kind === 'inductor')) {
			const [nodeA, nodeB] = graph.componentNodes[comp.id];
			const voltage =
				comp.kind === 'voltage_source' ? parseSourceValue(comp, mode)! : Complex.zero();
			constraintBranches.push({ comp, nodeA, nodeB, voltage });
		} else {
			nonConstraintBranches.push(comp);
		}
	}

	// 1. Propagate known node voltages from reference node "0" along constraint branches
	const knownVoltages = new Map<string, Complex>([['0', Complex.zero()]]);
	const constraintAdj = new Map<string, Array<{ branch: ConstraintBranch; other: string }>>();
	for (const nid of ['0', ...nonRefNodes]) constraintAdj.set(nid, []);
	for (const cb of constraintBranches) {
		constraintAdj.get(cb.nodeA)?.push({ branch: cb, other: cb.nodeB });
		constraintAdj.get(cb.nodeB)?.push({ branch: cb, other: cb.nodeA });
	}

	const bfsQueue = ['0'];
	while (bfsQueue.length > 0) {
		const curr = bfsQueue.shift()!;
		const currV = knownVoltages.get(curr)!;
		for (const { branch, other } of constraintAdj.get(curr) ?? []) {
			if (!knownVoltages.has(other)) {
				// V(nodeA) - V(nodeB) = branch.voltage
				const nextV =
					branch.nodeA === curr
						? currV.sub(branch.voltage)
						: currV.add(branch.voltage);
				knownVoltages.set(other, nextV);
				bfsQueue.push(other);
			}
		}
	}

	// 2. Remaining unknown nodes -> group into supernodes via floating constraint branches
	const unknownNodes = nonRefNodes.filter((id) => !knownVoltages.has(id));
	const unknownIdx = new Map<string, number>();
	unknownNodes.forEach((id, i) => unknownIdx.set(id, i));

	const ufParent = new Map<string, string>();
	for (const nid of unknownNodes) ufParent.set(nid, nid);
	const findSn = (x: string): string => {
		while (ufParent.get(x) !== x) x = ufParent.get(x)!;
		return x;
	};

	const floatingConstraints: ConstraintBranch[] = [];
	for (const cb of constraintBranches) {
		if (unknownIdx.has(cb.nodeA) && unknownIdx.has(cb.nodeB)) {
			floatingConstraints.push(cb);
			const rA = findSn(cb.nodeA);
			const rB = findSn(cb.nodeB);
			if (rA !== rB) ufParent.set(rA, rB);
		}
	}

	const supernodeMap = new Map<string, string[]>();
	for (const nid of unknownNodes) {
		const root = findSn(nid);
		const list = supernodeMap.get(root) ?? [];
		list.push(nid);
		supernodeMap.set(root, list);
	}
	const supernodes = Array.from(supernodeMap.values());

	// 3. Assemble reduced U x U nodal matrix A * V_unknown = b
	const U = unknownNodes.length;
	const A: Complex[][] = Array.from({ length: U }, () =>
		Array.from({ length: U }, () => Complex.zero())
	);
	const b: Complex[] = Array.from({ length: U }, () => Complex.zero());
	const kclLatex: string[] = [];

	let row = 0;
	for (const group of supernodes) {
		const groupSet = new Set(group);
		const eqTerms: string[] = [];
		let rhsConst = Complex.zero();

		for (const comp of nonConstraintBranches) {
			const [nA, nB] = graph.componentNodes[comp.id];
			const inA = groupSet.has(nA);
			const inB = groupSet.has(nB);
			if (inA === inB) continue; // completely internal or completely external to supernode

			if (comp.kind === 'current_source') {
				const is = parseSourceValue(comp, mode)!;
				// Current flows nA -> nB
				if (inA) {
					// leaves supernode -> +I_s on LHS -> -I_s on RHS
					b[row] = b[row].sub(is);
					eqTerms.push(`+ ${formatLatexTerm(is, mode)}`);
				} else {
					// enters supernode -> -I_s on LHS -> +I_s on RHS
					b[row] = b[row].add(is);
					eqTerms.push(`- ${formatLatexTerm(is, mode)}`);
				}
				continue;
			}

			const y = getPassiveAdmittance(comp, mode, freq);
			if (!y || y.isZero(1e-15)) continue;

			// Node inside supernode is `inside`, other is `outside`
			const inside = inA ? nA : nB;
			const outside = inA ? nB : nA;
			const idxIn = unknownIdx.get(inside)!;
			A[row][idxIn] = A[row][idxIn].add(y);

			const yTex = formatLatexTerm(y, mode);
			if (outside === '0') {
				eqTerms.push(`${yTex} V_{${inside}}`);
			} else if (knownVoltages.has(outside)) {
				const vKnown = knownVoltages.get(outside)!;
				const contrib = y.mul(vKnown);
				b[row] = b[row].add(contrib);
				rhsConst = rhsConst.add(contrib);
				eqTerms.push(`${yTex}(V_{${inside}} - ${formatLatexTerm(vKnown, mode)})`);
			} else {
				const idxOut = unknownIdx.get(outside)!;
				A[row][idxOut] = A[row][idxOut].sub(y);
				eqTerms.push(`${yTex}(V_{${inside}} - V_{${outside}})`);
			}
		}

		const labelPrefix =
			group.length > 1 ? `\\text{Supernode } \\{${group.join(', ')}\\}:\\; ` : `\\text{Node } ${group[0]}:\\; `;
		if (eqTerms.length > 2) {
			const cleanTerms = eqTerms.map((t, i) =>
				i === 0 ? t : t.startsWith('- ') || t.startsWith('+ ') ? t : `+ ${t}`
			);
			const lines: string[] = [];
			for (let i = 0; i < cleanTerms.length; i += 2) {
				lines.push(cleanTerms.slice(i, i + 2).join(' '));
			}
			kclLatex.push(
				`\\begin{aligned} ${labelPrefix}&${lines.join(' \\\\ &')} = 0 \\end{aligned}`
			);
		} else {
			kclLatex.push(`${labelPrefix}${eqTerms.join(' + ').replace(/\+ -/g, '- ')} = 0`);
		}
		row++;

		// Voltage constraint equations for floating sources inside this supernode
		const internalConstraints = floatingConstraints.filter(
			(cb) => groupSet.has(cb.nodeA) && groupSet.has(cb.nodeB)
		);
		for (const cb of internalConstraints) {
			const idxA = unknownIdx.get(cb.nodeA)!;
			const idxB = unknownIdx.get(cb.nodeB)!;
			A[row][idxA] = Complex.one();
			A[row][idxB] = Complex.one().neg();
			b[row] = cb.voltage;
			kclLatex.push(
				`\\text{Constraint (${latexSub(cb.comp.label)}):}\\; V_{${cb.nodeA}} - V_{${cb.nodeB}} = ${formatLatexValue(cb.voltage, mode)}`
			);
			row++;
		}
	}

	// Solve reduced system independently
	const nodeVoltages: Record<string, Complex> = {};
	for (const [nid, v] of knownVoltages.entries()) {
		nodeVoltages[nid] = v;
	}

	let matrixLatex: string | undefined;
	if (U > 0) {
		const solved = solveComplexLinearSystem(A, b);
		if (solved.singular) {
			return {
				methodId: 'nodal',
				title,
				applicable: false,
				inapplicableReason: 'Reduced nodal matrix is singular.',
				steps: []
			};
		}
		unknownNodes.forEach((nid, i) => {
			nodeVoltages[nid] = solved.x[i];
		});
		matrixLatex = matrixToLatex(
			A,
			unknownNodes.map((nid) => `V_{${nid}}`),
			b
		);
	}

	// Recover non-constraint branch voltages and currents
	const branchVoltages: Record<string, Complex> = {};
	const branchCurrents: Record<string, Complex> = {};
	const netNonConstraintLeaving = new Map<string, Complex>();
	for (const nid of ['0', ...nonRefNodes]) netNonConstraintLeaving.set(nid, Complex.zero());

	for (const comp of nonConstraintBranches) {
		const [nA, nB] = graph.componentNodes[comp.id];
		const vBranch = nodeVoltages[nA].sub(nodeVoltages[nB]);
		branchVoltages[comp.id] = vBranch;

		let iBranch = Complex.zero();
		if (comp.kind === 'current_source') {
			iBranch = parseSourceValue(comp, mode)!;
		} else {
			const y = getPassiveAdmittance(comp, mode, freq);
			if (y) iBranch = vBranch.mul(y);
		}
		branchCurrents[comp.id] = iBranch;

		if (nA !== nB) {
			netNonConstraintLeaving.set(nA, netNonConstraintLeaving.get(nA)!.add(iBranch));
			netNonConstraintLeaving.set(nB, netNonConstraintLeaving.get(nB)!.sub(iBranch));
		}
	}

	// Recover voltage-constraint branch currents via topological leaf-peeling
	const remainingAdj = new Map<string, Set<ConstraintBranch>>();
	for (const nid of ['0', ...nonRefNodes]) remainingAdj.set(nid, new Set());
	for (const cb of constraintBranches) {
		branchVoltages[cb.comp.id] = nodeVoltages[cb.nodeA].sub(nodeVoltages[cb.nodeB]);
		remainingAdj.get(cb.nodeA)!.add(cb);
		remainingAdj.get(cb.nodeB)!.add(cb);
	}

	const peeledLeaving = new Map<string, Complex>();
	for (const nid of ['0', ...nonRefNodes]) peeledLeaving.set(nid, Complex.zero());

	const peelQueue: string[] = [];
	for (const nid of nonRefNodes) {
		if ((remainingAdj.get(nid)?.size ?? 0) === 1) {
			peelQueue.push(nid);
		}
	}

	while (peelQueue.length > 0) {
		const u = peelQueue.shift()!;
		const incident = remainingAdj.get(u)!;
		if (incident.size !== 1) continue;
		const cb = incident.values().next().value!;
		const other = cb.nodeA === u ? cb.nodeB : cb.nodeA;

		// KCL at u: i_leaving_u + netNonConstraintLeaving[u] + peeledLeaving[u] = 0
		const iLeavingU = netNonConstraintLeaving.get(u)!.add(peeledLeaving.get(u)!).neg();
		const iBranch = cb.nodeA === u ? iLeavingU : iLeavingU.neg();
		branchCurrents[cb.comp.id] = iBranch;

		const iLeavingOther = cb.nodeA === other ? iBranch : iBranch.neg();
		peeledLeaving.set(other, peeledLeaving.get(other)!.add(iLeavingOther));

		incident.delete(cb);
		remainingAdj.get(other)!.delete(cb);
		if (other !== '0' && remainingAdj.get(other)!.size === 1) {
			peelQueue.push(other);
		}
	}

	// Build Pedagogical Steps
	const knownLatex = nonRefNodes
		.filter((nid) => knownVoltages.has(nid))
		.map((nid) => `V_{${nid}} = ${formatLatexValue(knownVoltages.get(nid)!, mode)}\\text{ V}`);

	const supernodeGroups = supernodes.filter((g) => g.length > 1);
	const solvedLatex = nonRefNodes.map(
		(nid) => `V_{${nid}} = ${formatLatexValue(nodeVoltages[nid], mode)}\\text{ V}`
	);

	const steps: SolutionStep[] = [
		{
			title: '1. Reference Node & Known Node Voltages',
			description:
				knownLatex.length > 0
					? `Reference node is "0" (0 V). Ground-referenced voltage sources directly fix ${knownLatex.length} node voltage(s).`
					: 'Reference node is "0" (0 V). No voltage sources are directly tied to ground, so all non-reference nodes are unknowns.',
			latex: knownLatex.length > 0 ? knownLatex : ['V_0 = 0\\text{ V}']
		}
	];

	if (supernodeGroups.length > 0) {
		steps.push({
			title: '2. Supernode Identification',
			description: `Floating voltage-constraint branches join non-reference nodes into ${supernodeGroups.length} supernode(s).`,
			latex: supernodeGroups.map(
				(g) => `\\text{Supernode: } \\{${g.join(', ')}\\}`
			)
		});
	}

	steps.push({
		title: `${supernodeGroups.length > 0 ? '3' : '2'}. Nodal KCL & Constraint Equations`,
		description:
			'Apply KCL at each ordinary node and supernode, plus V_a - V_b = V_s inside supernodes.',
		latex: kclLatex.length > 0 ? kclLatex : ['\\text{All node voltages are directly fixed by sources.}']
	});

	if (matrixLatex) {
		steps.push({
			title: `${supernodeGroups.length > 0 ? '4' : '3'}. Reduced Nodal Matrix System`,
			description: `Reduced ${U}×${U} nodal system (eliminating ground-referenced source nodes and voltage-source current rows).`,
			matrixLatex
		});
	}

	steps.push({
		title: `${supernodeGroups.length > 0 ? (matrixLatex ? '5' : '4') : matrixLatex ? '4' : '3'}. Solved Node Voltages`,
		description:
			'Solved node voltages and recovered branch currents via Ohm’s law and KCL leaf-peeling.',
		latex: solvedLatex
	});

	const verification = verifyAgainstMna(mna, {
		nodeVoltages,
		branchVoltages,
		branchCurrents
	});

	return {
		methodId: 'nodal',
		title,
		applicable: true,
		steps,
		summaryLatex: `\\begin{aligned} ${solvedLatex
			.slice(0, 6)
			.map((s) => s.replace(' = ', ' &= '))
			.join(' \\\\ ')} \\end{aligned}`,
		...verification
	};
}
