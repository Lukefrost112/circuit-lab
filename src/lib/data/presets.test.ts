import { describe, expect, it } from 'vitest';
import { buildElectricalGraph } from '../engine/graph';
import { solveMNA } from '../engine/mna';
import { getPresetById, PRESETS } from './presets';

const EXPECTED_NON_REF_NODES: Record<string, number> = {
	'dc-divider': 2,
	'dc-supernode': 2,
	'dc-supermesh': 3,
	'dc-wheatstone-bridge': 3,
	'dc-superposition-source-transform': 3,
	'dc-steady-state-rlc': 3,
	'ac-rlc-phasor': 3,
	'ac-multi-source-phasor': 4
};

describe('Curated Textbook DC & AC Presets', () => {
	it('contains 8 unique presets spanning DC and AC modes with valid load references', () => {
		expect(PRESETS.length).toBe(8);

		const ids = new Set(PRESETS.map((p) => p.id));
		expect(ids.size).toBe(8);

		const dcCount = PRESETS.filter((p) => p.category === 'dc').length;
		const acCount = PRESETS.filter((p) => p.category === 'ac').length;
		expect(dcCount).toBe(6);
		expect(acCount).toBe(2);

		for (const preset of PRESETS) {
			expect(getPresetById(preset.id)).toBe(preset);
			if (preset.theveninLoadId) {
				expect(
					preset.document.components.some((c) => c.id === preset.theveninLoadId)
				).toBe(true);
			}
		}
	});

	it.each(PRESETS)('preset "$id" solves cleanly with balanced power and zero errors', (preset) => {
		const graph = buildElectricalGraph(preset.document);
		expect(graph.nodes['0']).toBeDefined();
		expect(graph.nonRefNodeIds.length).toBe(EXPECTED_NON_REF_NODES[preset.id]);

		const sol = solveMNA(preset.document);
		const errorDiags = sol.diagnostics.filter((d) => d.severity === 'error');
		expect(errorDiags).toEqual([]);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.powerBalance.totalSuppliedReal).toBeGreaterThan(0);
	});

	it('matches exact analytical textbook solutions on all DC presets', () => {
		// 1. DC Divider: V(R3) = 8 V, I(R1) = 2 mA
		const divSol = solveMNA(getPresetById('dc-divider')!.document);
		expect(divSol.branches['R3'].voltage.re).toBeCloseTo(8, 9);
		expect(divSol.branches['R1'].current.re).toBeCloseTo(0.002, 9);

		// 2. DC Supernode: V(R1) = 16 V, V(R2) = 4 V, I(V1) = 2 A
		const supNodeSol = solveMNA(getPresetById('dc-supernode')!.document);
		expect(supNodeSol.branches['R1'].voltage.re).toBeCloseTo(16, 9);
		expect(supNodeSol.branches['R2'].voltage.re).toBeCloseTo(4, 9);
		expect(supNodeSol.branches['V1'].current.re).toBeCloseTo(2, 9);

		// 3. DC Supermesh: I(R1) = 2.5 A, I(R2) = 4.5 A, V(R3) = 18 V
		const supMeshSol = solveMNA(getPresetById('dc-supermesh')!.document);
		expect(supMeshSol.branches['R1'].current.re).toBeCloseTo(2.5, 9);
		expect(supMeshSol.branches['R2'].current.re).toBeCloseTo(4.5, 9);
		expect(supMeshSol.branches['R3'].voltage.re).toBeCloseTo(18, 9);

		// 4. DC Wheatstone Bridge: I(R5) = 1/70 A
		const bridgeSol = solveMNA(getPresetById('dc-wheatstone-bridge')!.document);
		expect(bridgeSol.branches['R5'].current.re).toBeCloseTo(1 / 70, 9);

		// 5. DC Superposition & Source Transform: V(R3) = 8 V, V(R4) = 10 V
		const superPosSol = solveMNA(getPresetById('dc-superposition-source-transform')!.document);
		expect(superPosSol.branches['R3'].voltage.re).toBeCloseTo(8, 9);
		expect(superPosSol.branches['R4'].voltage.re).toBeCloseTo(10, 9);

		// 6. DC Steady-State RLC: I(C1) = 0 A, V(C1) = 12 V, V(L1) = 0 V, I(L1) = 3 A
		const rlcDcSol = solveMNA(getPresetById('dc-steady-state-rlc')!.document);
		expect(rlcDcSol.branches['C1'].current.re).toBeCloseTo(0, 9);
		expect(rlcDcSol.branches['C1'].voltage.re).toBeCloseTo(12, 9);
		expect(rlcDcSol.branches['L1'].voltage.re).toBeCloseTo(0, 9);
		expect(rlcDcSol.branches['L1'].current.re).toBeCloseTo(3, 9);
	});
});
