/**
 * Unified Circuit Solver & Cross-Verification Gate.
 * Runs MNA ground truth, executes all requested pedagogical methods,
 * and aggregates cross-verification discrepancies across every method.
 */

import { solveMNA, type SolveMnaOptions } from './mna';
import { solveKclKvl } from './methods/kcl-kvl';
import { solveMesh } from './methods/mesh';
import { solveNodal } from './methods/nodal';
import { solveSourceTransform } from './methods/source-transform';
import { solveSuperposition } from './methods/superposition';
import { solveTheveninNorton } from './methods/thevenin-norton';
import type {
	CircuitDocument,
	FullSolveResult,
	MethodId,
	MethodResult,
	TheveninNortonResult,
	TheveninTarget
} from './types';

export interface SolveCircuitOptions extends SolveMnaOptions {
	theveninTarget?: TheveninTarget;
	methods?: MethodId[];
}

const ALL_METHODS: MethodId[] = [
	'kcl_kvl',
	'nodal',
	'mesh',
	'superposition',
	'source_transform',
	'thevenin_norton'
];

/**
 * Solves a CircuitDocument using MNA and all requested pedagogical methods,
 * verifying every applicable method independently against MNA (< 1e-8).
 */
export function solveCircuit(
	doc: CircuitDocument,
	options?: SolveCircuitOptions
): FullSolveResult {
	const mna = solveMNA(doc, {
		frequencyHz: options?.frequencyHz,
		acMagnitudeMode: options?.acMagnitudeMode
	});

	if (!mna.valid) {
		return {
			mna,
			methods: {},
			allVerified: false,
			maxDiscrepancy: 0
		};
	}

	const requested = options?.methods ?? ALL_METHODS;
	const methods: Partial<Record<MethodId, MethodResult>> = {};
	let theveninNorton: TheveninNortonResult | undefined;

	for (const methodId of requested) {
		switch (methodId) {
			case 'kcl_kvl':
				methods.kcl_kvl = solveKclKvl(doc, mna);
				break;
			case 'nodal':
				methods.nodal = solveNodal(doc, mna);
				break;
			case 'mesh':
				methods.mesh = solveMesh(doc, mna);
				break;
			case 'superposition':
				methods.superposition = solveSuperposition(doc, mna);
				break;
			case 'source_transform':
				methods.source_transform = solveSourceTransform(doc, mna);
				break;
			case 'thevenin_norton': {
				const res = solveTheveninNorton(doc, mna, options?.theveninTarget);
				methods.thevenin_norton = res.methodResult;
				theveninNorton = res.theveninNorton;
				break;
			}
		}
	}

	let allVerified = true;
	let maxDiscrepancy = 0;

	for (const res of Object.values(methods)) {
		if (!res || !res.applicable) continue;
		if (!res.verifiedAgainstMna) {
			allVerified = false;
		}
		if (res.maxDiscrepancy !== undefined && res.maxDiscrepancy > maxDiscrepancy) {
			maxDiscrepancy = res.maxDiscrepancy;
		}
	}

	return {
		mna,
		methods,
		theveninNorton,
		allVerified,
		maxDiscrepancy
	};
}
