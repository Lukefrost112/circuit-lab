import { describe, expect, it } from 'vitest';
import { Complex } from '../complex';
import { exportCircuitJson, parseCircuitImport } from '../io';
import { solveCircuit } from '../solve';
import type { CircuitComponent, CircuitDocument } from '../types';
import { solveUnknownParameter } from '../unknown-solver';

function comp(
	id: string,
	kind: CircuitComponent['kind'],
	x: number,
	y: number,
	rotation: CircuitComponent['rotation'],
	value: string,
	extra?: Partial<CircuitComponent>
): CircuitComponent {
	return { id, kind, label: id, x, y, rotation, value, ...extra };
}

function wire(id: string, ...pts: Array<[number, number]>) {
	return { id, points: pts.map(([x, y]) => ({ x, y })) };
}

const OMEGA_1000_HZ = 1000 / (2 * Math.PI);

describe('solveUnknownParameter — Exact Analytical Inverse Circuit Solver', () => {
	it('1. DC unknown voltage source given branch current (I_R3 = 2mA -> exact V1 = 36V)', () => {
		// V1: (0,4) rot 90 -> +:(0,2)[N1], -:(0,6)[0]
		// R1: (2,2) rot 0 -> a:(0,2)[N1], b:(4,2)[N2], 6k
		// R2: (4,4) rot 90 -> a:(4,2)[N2], b:(4,6)[0], 6k
		// R3: (8,4) rot 90 -> a:(8,2)[N2], b:(8,6)[0], 6k
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '?'),
				comp('R1', 'resistor', 2, 2, 0, '6k'),
				comp('R2', 'resistor', 4, 4, 90, '6k'),
				comp('R3', 'resistor', 8, 4, 90, '6k'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_top', [4, 2], [8, 2]), wire('w_gnd', [0, 6], [8, 6])]
		};

		const res = solveUnknownParameter(doc, {
			componentId: 'V1',
			symbol: 'Vs',
			constraint: { kind: 'branch_current', targetId: 'R3', value: '2m' }
		});

		expect(res.valid).toBe(true);
		expect(res.solutions).toHaveLength(1);
		expect(res.solutions[0].value.re).toBeCloseTo(36, 10);
		expect(res.solutions[0].discrepancy).toBeLessThan(1e-10);
		expect(res.solutions[0].verified).toBe(true);
		expect(res.steps.length).toBeGreaterThanOrEqual(3);
	});

	it('2. DC unknown voltage source given node voltage with nonzero offset y(0) != 0', () => {
		// V1 (N1 -> 0), R1 = 2k (N1 -> N2), R2 = 2k (N2 -> 0), I1 = 3m (0 -> N2)
		// V_N2 = 0.5 * V1 + 3 => V_N2 = 10 V gives V1 = 14 V
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '10'),
				comp('R1', 'resistor', 2, 2, 0, '2k'),
				comp('R2', 'resistor', 4, 4, 90, '2k'),
				comp('I1', 'current_source', 8, 4, 270, '3m'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_top', [4, 2], [8, 2]), wire('w_gnd', [0, 6], [8, 6])]
		};

		const res = solveUnknownParameter(doc, {
			componentId: 'V1',
			symbol: 'V',
			constraint: { kind: 'node_voltage', targetId: 'N2', value: '10' }
		});

		expect(res.valid).toBe(true);
		expect(res.solutions).toHaveLength(1);
		expect(res.solutions[0].value.re).toBeCloseTo(14, 10);
		expect(res.solutions[0].discrepancy).toBeLessThan(1e-10);
		expect(res.solutions[0].verified).toBe(true);
	});

	it('3. DC unknown current source given branch voltage (V_R2 = 12V -> I1 = 6A)', () => {
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('I1', 'current_source', 0, 4, 270, '1'),
				comp('R1', 'resistor', 4, 4, 90, '3'),
				comp('R2', 'resistor', 8, 4, 90, '6'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_top', [0, 2], [8, 2]), wire('w_bot', [0, 6], [8, 6])]
		};

		const res = solveUnknownParameter(doc, {
			componentId: 'I1',
			symbol: 'Is',
			constraint: { kind: 'branch_voltage', targetId: 'R2', value: '12' }
		});

		expect(res.valid).toBe(true);
		expect(res.solutions).toHaveLength(1);
		expect(res.solutions[0].value.re).toBeCloseTo(6, 10);
		expect(res.solutions[0].discrepancy).toBeLessThan(1e-10);
		expect(res.solutions[0].verified).toBe(true);
	});

	it('4. DC unknown resistor given node voltage & branch current (exact Möbius inversion)', () => {
		// Ladder: V1 = 20V (N1->0), R1 = 10 (N1->N2), Rx (N2->0), R2 = 10 (N2->N3), R3 = 10 (N3->0)
		// When Rx = 20 Ω: V_N2 = 10 V, V_N3 = 5 V, I_R3 = 0.5 A
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '20'),
				comp('R1', 'resistor', 2, 2, 0, '10'),
				comp('Rx', 'resistor', 4, 4, 90, '100'),
				comp('R2', 'resistor', 6, 2, 0, '10'),
				comp('R3', 'resistor', 8, 4, 90, '10'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_gnd', [0, 6], [8, 6])]
		};

		const byNodeV = solveUnknownParameter(doc, {
			componentId: 'Rx',
			symbol: 'Rx',
			constraint: { kind: 'node_voltage', targetId: 'N3', value: '5' }
		});
		expect(byNodeV.valid).toBe(true);
		expect(byNodeV.solutions).toHaveLength(1);
		expect(byNodeV.solutions[0].value.re).toBeCloseTo(20, 10);
		expect(byNodeV.solutions[0].discrepancy).toBeLessThan(1e-10);
		expect(byNodeV.solutions[0].verified).toBe(true);

		const byBranchI = solveUnknownParameter(doc, {
			componentId: 'Rx',
			symbol: 'Rx',
			constraint: { kind: 'branch_current', targetId: 'R3', value: '0.5' }
		});
		expect(byBranchI.valid).toBe(true);
		expect(byBranchI.solutions).toHaveLength(1);
		expect(byBranchI.solutions[0].value.re).toBeCloseTo(20, 10);
		expect(byBranchI.solutions[0].discrepancy).toBeLessThan(1e-10);
		expect(byBranchI.solutions[0].verified).toBe(true);
	});

	it('5. DC unknown resistor given branch power: returns BOTH positive roots and rejects P > P_max', () => {
		// V1 = 12 V, R1 = 4 Ω, Rx = ? => P_max = 144 / 16 = 9 W at Rx = 4 Ω
		// For P(Rx) = 8 W => Rx^2 - 10 Rx + 16 = 0 => Rx = 2 Ω and Rx = 8 Ω
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '12'),
				comp('R1', 'resistor', 2, 2, 0, '4'),
				comp('Rx', 'resistor', 4, 4, 90, '10'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_gnd', [0, 6], [4, 6])]
		};

		const twoRoots = solveUnknownParameter(doc, {
			componentId: 'Rx',
			symbol: 'R_L',
			constraint: { kind: 'branch_power', targetId: 'Rx', value: '8' }
		});
		expect(twoRoots.valid).toBe(true);
		expect(twoRoots.solutions).toHaveLength(2);
		expect(twoRoots.solutions[0].value.re).toBeCloseTo(2, 10);
		expect(twoRoots.solutions[1].value.re).toBeCloseTo(8, 10);
		expect(twoRoots.solutions[0].discrepancy).toBeLessThan(1e-10);
		expect(twoRoots.solutions[1].discrepancy).toBeLessThan(1e-10);
		expect(twoRoots.solutions[0].verified).toBe(true);
		expect(twoRoots.solutions[1].verified).toBe(true);

		// Target exceeding P_max = 9 W
		const overMax = solveUnknownParameter(doc, {
			componentId: 'Rx',
			symbol: 'R_L',
			constraint: { kind: 'branch_power', targetId: 'Rx', value: '10' }
		});
		expect(overMax.valid).toBe(false);
		expect(overMax.error).toMatch(/P_max|maximum transferable power/i);

		// Power on ANOTHER branch R1: P_R1 = 16 W => (4 + Rx)^2 = 36 => Rx = 2 Ω
		const otherBranch = solveUnknownParameter(doc, {
			componentId: 'Rx',
			symbol: 'R_L',
			constraint: { kind: 'branch_power', targetId: 'R1', value: '16' }
		});
		expect(otherBranch.valid).toBe(true);
		expect(otherBranch.solutions).toHaveLength(1);
		expect(otherBranch.solutions[0].value.re).toBeCloseTo(2, 10);
		expect(otherBranch.solutions[0].discrepancy).toBeLessThan(1e-10);
	});

	it('6. DC unknown voltage source given branch power (quadratic roots)', () => {
		// V1 (N1->0), R1 = 2 (N1->N2), R2 = 2 (N2->0), I1 = 1 A (0->N2)
		// V_N2 = 0.5*V1 + 1; P_R2 = V_N2^2 / 2 = 8 W => V_N2 = ±4 V => V1 = 6 V or -10 V
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '1'),
				comp('R1', 'resistor', 2, 2, 0, '2'),
				comp('R2', 'resistor', 4, 4, 90, '2'),
				comp('I1', 'current_source', 8, 4, 270, '1'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_top', [4, 2], [8, 2]), wire('w_gnd', [0, 6], [8, 6])]
		};

		const res = solveUnknownParameter(doc, {
			componentId: 'V1',
			symbol: 'V',
			constraint: { kind: 'branch_power', targetId: 'R2', value: '8' }
		});

		expect(res.valid).toBe(true);
		expect(res.solutions).toHaveLength(2);
		expect(res.solutions[0].value.re).toBeCloseTo(6, 10);
		expect(res.solutions[1].value.re).toBeCloseTo(-10, 10);
		expect(res.solutions.every((s) => s.verified && s.discrepancy < 1e-10)).toBe(true);
	});

	it('7. AC unknown phasor voltage source given complex branch current', () => {
		// omega = 1000 rad/s; R1 = 30 Ω, L1 = 40 mH => Z = 30 + j40 Ω
		// Target I_R1 = 2∠0° A => Vs = 60 + j80 V = 100∠53.1301° V
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: OMEGA_1000_HZ,
			acMagnitudeMode: 'rms',
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '10∠15°', { phaseDeg: 15 }),
				comp('R1', 'resistor', 2, 2, 0, '30'),
				comp('L1', 'inductor', 4, 4, 90, '40m'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_gnd', [0, 6], [4, 6])]
		};

		const res = solveUnknownParameter(doc, {
			componentId: 'V1',
			symbol: 'Vs',
			constraint: { kind: 'branch_current', targetId: 'R1', value: '2∠0°' }
		});

		expect(res.valid).toBe(true);
		expect(res.solutions).toHaveLength(1);
		const expected = Complex.from(60, 80);
		expect(res.solutions[0].value.sub(expected).abs()).toBeLessThan(1e-9);
		expect(res.solutions[0].discrepancy).toBeLessThan(1e-10);
		expect(res.solutions[0].verified).toBe(true);
	});

	it('8. AC unknown inductor L and unknown capacitor C given target node voltage', () => {
		// Series V1 = 10∠0° V, R1 = 100 Ω, L1 = ? at omega = 1000 rad/s
		// Target V(N2) = 5+j5 V => Z_L = j100 Ω => L = 100 mH
		const docL: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: OMEGA_1000_HZ,
			acMagnitudeMode: 'rms',
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '10∠0°'),
				comp('R1', 'resistor', 2, 2, 0, '100'),
				comp('L1', 'inductor', 4, 4, 90, '1m'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_gnd', [0, 6], [4, 6])]
		};

		const resL = solveUnknownParameter(docL, {
			componentId: 'L1',
			symbol: 'Lx',
			constraint: { kind: 'node_voltage', targetId: 'N2', value: '5+j5' }
		});

		expect(resL.valid).toBe(true);
		expect(resL.solutions).toHaveLength(1);
		expect(resL.solutions[0].value.re).toBeCloseTo(0.1, 10);
		expect(resL.solutions[0].discrepancy).toBeLessThan(1e-10);
		expect(resL.solutions[0].verified).toBe(true);

		// Series V1 = 10∠0° V, R1 = 100 Ω, C1 = ? at omega = 1000 rad/s
		// Target V(N2) = 5-j5 V => Z_C = -j100 Ω => C = 10 µF
		const docC: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: OMEGA_1000_HZ,
			acMagnitudeMode: 'rms',
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '10∠0°'),
				comp('R1', 'resistor', 2, 2, 0, '100'),
				comp('C1', 'capacitor', 4, 4, 90, '1u'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_gnd', [0, 6], [4, 6])]
		};

		const resC = solveUnknownParameter(docC, {
			componentId: 'C1',
			symbol: 'Cx',
			constraint: { kind: 'node_voltage', targetId: 'N2', value: '5-j5' }
		});

		expect(resC.valid).toBe(true);
		expect(resC.solutions).toHaveLength(1);
		expect(resC.solutions[0].value.re).toBeCloseTo(1e-5, 12);
		expect(resC.solutions[0].discrepancy).toBeLessThan(1e-10);
		expect(resC.solutions[0].verified).toBe(true);
	});

	it('9. Zero-sensitivity, DC reactive, and unphysical targets return clear valid: false errors', () => {
		// Two decoupled sub-branches sharing GND: V1 drives R1, V2 drives R2
		const docDecoupled: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '10'),
				comp('R1', 'resistor', 4, 4, 90, '1k'),
				comp('V2', 'voltage_source', 10, 4, 90, '5'),
				comp('R2', 'resistor', 14, 4, 90, '1k'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [
				wire('w1', [0, 2], [4, 2]),
				wire('w2', [10, 2], [14, 2]),
				wire('w_gnd', [0, 6], [14, 6])
			]
		};

		const zeroSens = solveUnknownParameter(docDecoupled, {
			componentId: 'V1',
			constraint: { kind: 'branch_current', targetId: 'R2', value: '10m' }
		});
		expect(zeroSens.valid).toBe(false);
		expect(zeroSens.error).toMatch(/independent|sensitivity k = 0/i);

		// Unphysical resistor target: V_N2 = 15 V > 12 V supply
		const divider: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '12'),
				comp('R1', 'resistor', 2, 2, 0, '2k'),
				comp('R2', 'resistor', 4, 4, 90, '4k'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_gnd', [0, 6], [4, 6])]
		};
		const negRes = solveUnknownParameter(divider, {
			componentId: 'R2',
			constraint: { kind: 'node_voltage', targetId: 'N2', value: '15' }
		});
		expect(negRes.valid).toBe(false);
		expect(negRes.error).toMatch(/non-positive|physical/i);

		// Unknown capacitor in DC mode
		const dcCap: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '12'),
				comp('R1', 'resistor', 2, 2, 0, '1k'),
				comp('C1', 'capacitor', 4, 4, 90, '10u'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_gnd', [0, 6], [4, 6])]
		};
		const dcCapRes = solveUnknownParameter(dcCap, {
			componentId: 'C1',
			constraint: { kind: 'node_voltage', targetId: 'N2', value: '6' }
		});
		expect(dcCapRes.valid).toBe(false);
		expect(dcCapRes.error).toMatch(/DC steady-state|AC mode/i);
	});

	it('10. Full solveCircuit() integration & JSON round-trip preserves unknownProblem and verifies all methods', () => {
		const doc: CircuitDocument = {
			schemaVersion: 1,
			name: 'Inverse Divider Verification',
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '10'),
				comp('R1', 'resistor', 2, 2, 0, '6k'),
				comp('R2', 'resistor', 4, 4, 90, '6k'),
				comp('R3', 'resistor', 8, 4, 90, '6k'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_top', [4, 2], [8, 2]), wire('w_gnd', [0, 6], [8, 6])],
			unknownProblem: {
				componentId: 'V1',
				symbol: 'V',
				constraint: { kind: 'branch_current', targetId: 'R3', value: '2m', label: 'I_x' }
			}
		};

		const full = solveCircuit(doc);
		expect(full.unknownSolution?.valid).toBe(true);
		expect(full.unknownSolution?.solutions[0].value.re).toBeCloseTo(36, 10);
		expect(full.mna.valid).toBe(true);
		expect(full.mna.branches['V1'].voltage.re).toBeCloseTo(36, 10);
		expect(full.mna.branches['R3'].current.re).toBeCloseTo(0.002, 10);
		expect(full.mna.powerBalance.balanced).toBe(true);
		expect(full.allVerified).toBe(true);
		expect(full.maxDiscrepancy).toBeLessThan(1e-8);

		// JSON round-trip preserves unknownProblem cleanly
		const json = exportCircuitJson(doc);
		const reimported = parseCircuitImport(json);
		expect(reimported.ok).toBe(true);
		if (reimported.ok) {
			expect(reimported.document.unknownProblem).toEqual(doc.unknownProblem);
		}
	});
});
