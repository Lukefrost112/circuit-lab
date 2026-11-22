import { describe, expect, it } from 'vitest';
import { Complex } from '../complex';
import { solveMNA } from '../mna';
import type { CircuitComponent, CircuitDocument } from '../types';

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

describe('solveMNA — 15+ classic DC & AC circuits + error diagnostics', () => {
	// 1. DC Voltage Divider
	it('1. DC Voltage Divider (12V, 2k, 4k -> 8V)', () => {
		// V1: (0,4) rot 90 -> +:(0,2), -:(0,6)
		// R1: (2,2) rot 0 -> a:(0,2), b:(4,2)
		// R2: (4,4) rot 90 -> a:(4,2), b:(4,6)
		// G1: (0,6)
		const doc: CircuitDocument = {
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

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['R2'].voltage.re).toBeCloseTo(8, 9);
		expect(sol.branches['R1'].voltage.re).toBeCloseTo(4, 9);
		expect(sol.branches['R1'].current.re).toBeCloseTo(0.002, 9);
		expect(sol.branches['V1'].current.re).toBeCloseTo(-0.002, 9);
		expect(sol.branches['V1'].realPower).toBeCloseTo(-0.024, 9);
		expect(sol.branches['R1'].realPower).toBeCloseTo(0.008, 9);
		expect(sol.branches['R2'].realPower).toBeCloseTo(0.016, 9);
	});

	// 2. DC Current Divider
	it('2. DC Current Divider (6A, 3Ω || 6Ω -> 12V, 4A, 2A)', () => {
		// I1: (0,4) rot 270 -> in:(0,6) [gnd], out:(0,2) [N1] (pushes 6A into N1)
		// R1: (4,4) rot 90 -> a:(4,2), b:(4,6)
		// R2: (8,4) rot 90 -> a:(8,2), b:(8,6)
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('I1', 'current_source', 0, 4, 270, '6'),
				comp('R1', 'resistor', 4, 4, 90, '3'),
				comp('R2', 'resistor', 8, 4, 90, '6'),
				comp('G1', 'ground', 0, 6, 0, '0')
			],
			wires: [wire('w_top', [0, 2], [8, 2]), wire('w_bot', [0, 6], [8, 6])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['R1'].voltage.re).toBeCloseTo(12, 9);
		expect(sol.branches['R1'].current.re).toBeCloseTo(4, 9);
		expect(sol.branches['R2'].current.re).toBeCloseTo(2, 9);
		expect(sol.branches['I1'].realPower).toBeCloseTo(-72, 9);
	});

	// 3. Balanced Wheatstone Bridge
	it('3. DC Balanced Wheatstone Bridge (zero bridge current)', () => {
		// V1: (0,4) rot 90 -> +:(0,2), -:(0,6)
		// Left arm: R1(100) from (4,2) to (4,6)? Let's use clean grid nodes:
		// Top node: y=0, Left mid: (4,4), Right mid: (8,4), Bottom: y=8
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '10'), // +:(0,2), -:(0,6)
				comp('R1', 'resistor', 4, 2, 90, '100'), // (4,0)-(4,4)
				comp('R2', 'resistor', 4, 6, 90, '200'), // (4,4)-(4,8)
				comp('R3', 'resistor', 8, 2, 90, '150'), // (8,0)-(8,4)
				comp('R4', 'resistor', 8, 6, 90, '300'), // (8,4)-(8,8)
				comp('R5', 'resistor', 6, 4, 0, '500'), // (4,4)-(8,4)
				comp('G1', 'ground', 0, 8, 0, '0')
			],
			wires: [
				wire('w_top', [0, 2], [0, 0], [8, 0]),
				wire('w_bot', [0, 6], [0, 8], [8, 8])
			]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['R5'].voltage.re).toBeCloseTo(0, 9);
		expect(sol.branches['R5'].current.re).toBeCloseTo(0, 9);
		expect(sol.branches['R2'].voltage.re).toBeCloseTo(20 / 3, 9);
		expect(sol.branches['R4'].voltage.re).toBeCloseTo(20 / 3, 9);
	});

	// 4. Unbalanced Wheatstone Bridge
	it('4. DC Unbalanced Wheatstone Bridge (exact rational solution 76/7 V, 96/7 V)', () => {
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 4, 90, '24'),
				comp('R1', 'resistor', 4, 2, 90, '6'),
				comp('R2', 'resistor', 4, 6, 90, '3'),
				comp('R3', 'resistor', 8, 2, 90, '4'),
				comp('R4', 'resistor', 8, 6, 90, '12'),
				comp('R5', 'resistor', 6, 4, 0, '2'),
				comp('G1', 'ground', 0, 8, 0, '0')
			],
			wires: [
				wire('w_top', [0, 2], [0, 0], [8, 0]),
				wire('w_bot', [0, 6], [0, 8], [8, 8])
			]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['R2'].voltage.re).toBeCloseTo(76 / 7, 9);
		expect(sol.branches['R4'].voltage.re).toBeCloseTo(96 / 7, 9);
		expect(sol.branches['R5'].current.re).toBeCloseTo(-10 / 7, 9);
	});

	// 5. Multi-source DC Supernode Circuit
	it('5. Multi-source DC Supernode (V1=10V, floating V2=6V, I1=3A -> 108/11 V, 42/11 V)', () => {
		// N1 at (0,0), N2 at (4,0), N3 at (8,0), Gnd at y=4
		// V1: (0,2) rot 90 -> +:(0,0)[N1], -:(0,4)[0]
		// R1: (2,0) rot 0 -> a:(0,0)[N1], b:(4,0)[N2]
		// R2: (4,2) rot 90 -> a:(4,0)[N2], b:(4,4)[0]
		// V2: (6,0) rot 0 -> +:(4,0)[N2], -:(8,0)[N3]
		// R3: (8,2) rot 90 -> a:(8,0)[N3], b:(8,4)[0]
		// I1: (12,2) rot 270 -> in:(12,4)[0], out:(12,0)[N3]
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '10'),
				comp('R1', 'resistor', 2, 0, 0, '2'),
				comp('R2', 'resistor', 4, 2, 90, '4'),
				comp('V2', 'voltage_source', 6, 0, 0, '6'),
				comp('R3', 'resistor', 8, 2, 90, '6'),
				comp('I1', 'current_source', 12, 2, 270, '3'),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w_n3', [8, 0], [12, 0]), wire('w_gnd', [0, 4], [12, 4])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['R2'].voltage.re).toBeCloseTo(108 / 11, 9);
		expect(sol.branches['R3'].voltage.re).toBeCloseTo(42 / 11, 9);
		expect(sol.branches['V2'].voltage.re).toBeCloseTo(6, 9);
	});

	// 6. DC Circuit with Capacitor (open) and Inductor (short)
	it('6. DC steady state with Capacitor (open, I_C=0) & Inductor (short, V_L=0)', () => {
		// V1=15V (0,0)-(0,4), R1=3Ω (0,0)-(4,0), L1=10mH (4,0)-(8,0), R2=2Ω (8,0)-(8,4)
		// C1=100uF (4,2) rot 90 -> (4,0)-(4,4)
		// C2=47uF (4,-2) rot 0 -> (2,-2)-(6,-2) wired to (0,0) and (8,0)
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '15'),
				comp('R1', 'resistor', 2, 0, 0, '3'),
				comp('L1', 'inductor', 6, 0, 0, '10m'),
				comp('R2', 'resistor', 8, 2, 90, '2'),
				comp('C1', 'capacitor', 4, 2, 90, '100u'),
				comp('C2', 'capacitor', 4, -2, 0, '47u'),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [
				wire('w_gnd', [0, 4], [8, 4]),
				wire('w_c2a', [0, 0], [0, -2], [2, -2]),
				wire('w_c2b', [6, -2], [8, -2], [8, 0])
			]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.diagnostics.some((d) => d.code === 'DC_CAPACITOR_OPEN')).toBe(true);
		expect(sol.diagnostics.some((d) => d.code === 'DC_INDUCTOR_SHORT')).toBe(true);
		expect(sol.branches['C1'].current.abs()).toBeCloseTo(0, 12);
		expect(sol.branches['C1'].voltage.re).toBeCloseTo(6, 9);
		expect(sol.branches['C2'].current.abs()).toBeCloseTo(0, 12);
		expect(sol.branches['C2'].voltage.re).toBeCloseTo(9, 9);
		expect(sol.branches['L1'].voltage.abs()).toBeCloseTo(0, 12);
		expect(sol.branches['L1'].current.re).toBeCloseTo(3, 9);
	});

	// 7. DC 2-Loop Bridge-T Network
	it('7. DC 2-Loop Network (20V + 2A -> exact 12V on both nodes)', () => {
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '20'),
				comp('R1', 'resistor', 2, 0, 0, '4'),
				comp('R2', 'resistor', 4, 2, 90, '6'),
				comp('R3', 'resistor', 6, 0, 0, '3'),
				comp('R4', 'resistor', 8, 2, 90, '6'),
				comp('I1', 'current_source', 12, 2, 270, '2'),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w_n3', [8, 0], [12, 0]), wire('w_gnd', [0, 4], [12, 4])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['R2'].voltage.re).toBeCloseTo(12, 9);
		expect(sol.branches['R4'].voltage.re).toBeCloseTo(12, 9);
		expect(sol.branches['R3'].current.re).toBeCloseTo(0, 9);
	});

	// 8. DC Dual-Current-Source Pi Network
	it('8. DC Dual-Current-Source Pi Network (exact 78/11 V, 30/11 V)', () => {
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('I1', 'current_source', 0, 2, 270, '5'), // 0 -> N1
				comp('R1', 'resistor', 4, 2, 90, '2'), // N1 -> 0
				comp('R2', 'resistor', 6, 0, 0, '3'), // N1 -> N2
				comp('R3', 'resistor', 8, 2, 90, '6'), // N2 -> 0
				comp('I2', 'current_source', 12, 2, 90, '1'), // N2 -> 0
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [
				wire('w_n1', [0, 0], [4, 0]),
				wire('w_n2', [8, 0], [12, 0]),
				wire('w_gnd', [0, 4], [12, 4])
			]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['R1'].voltage.re).toBeCloseTo(78 / 11, 9);
		expect(sol.branches['R3'].voltage.re).toBeCloseTo(30 / 11, 9);
	});

	// 9. Series RLC AC Phasor Circuit (Inductive, lagging pf = 0.6)
	it('9. Series RLC AC Phasor Circuit (3-4-5 impedance triangle, exact power & pf)', () => {
		const freq = 1000 / (2 * Math.PI); // omega = 1000 rad/s
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: freq,
			acMagnitudeMode: 'rms',
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '100∠0°'), // +:(0,0), -:(0,4)
				comp('R1', 'resistor', 2, 0, 0, '30'), // (0,0)-(4,0)
				comp('L1', 'inductor', 6, 0, 0, '80m'), // (4,0)-(8,0), X_L = 80
				comp('C1', 'capacitor', 8, 2, 90, '25u'), // (8,0)-(8,4), X_C = 40
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w_gnd', [0, 4], [8, 4])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);

		const iBranch = sol.branches['R1'].current;
		expect(iBranch.equals(Complex.from(1.2, -1.6), 1e-9)).toBe(true);
		expect(iBranch.abs()).toBeCloseTo(2, 9);
		expect(iBranch.argDeg()).toBeCloseTo(-53.13010235415598, 9);

		expect(sol.branches['R1'].realPower).toBeCloseTo(120, 9);
		expect(sol.branches['R1'].reactivePower).toBeCloseTo(0, 9);
		expect(sol.branches['L1'].realPower).toBeCloseTo(0, 9);
		expect(sol.branches['L1'].reactivePower).toBeCloseTo(320, 9);
		expect(sol.branches['L1'].powerFactorType).toBe('lagging');
		expect(sol.branches['C1'].realPower).toBeCloseTo(0, 9);
		expect(sol.branches['C1'].reactivePower).toBeCloseTo(-160, 9);
		expect(sol.branches['C1'].powerFactorType).toBe('leading');
		expect(sol.branches['V1'].realPower).toBeCloseTo(-120, 9);
		expect(sol.branches['V1'].reactivePower).toBeCloseTo(-160, 9);
		expect(sol.powerBalance.totalRealPower).toBeCloseTo(0, 9);
		expect(sol.powerBalance.totalReactivePower).toBeCloseTo(0, 9);
	});

	// 10. Series RLC AC Capacitive (Leading)
	it('10. Series RLC AC Capacitive Circuit (50∠30° V, Z = 40 - j30 Ω)', () => {
		const freq = 1000 / (2 * Math.PI);
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: freq,
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '50∠30°'),
				comp('R1', 'resistor', 2, 0, 0, '40'),
				comp('L1', 'inductor', 6, 0, 0, '10m'),
				comp('C1', 'capacitor', 8, 2, 90, '25u'),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w_gnd', [0, 4], [8, 4])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);

		const i = sol.branches['R1'].current;
		expect(i.abs()).toBeCloseTo(1, 9);
		expect(i.argDeg()).toBeCloseTo(30 + 36.86989764584402, 9);
		expect(sol.branches['R1'].realPower).toBeCloseTo(40, 9);
		expect(sol.branches['L1'].reactivePower).toBeCloseTo(10, 9);
		expect(sol.branches['C1'].reactivePower).toBeCloseTo(-40, 9);
	});

	// 11. Parallel RLC AC Circuit at Exact Resonance
	it('11. Parallel RLC AC Circuit at Resonance (purely real Z_eq = R, Q_L + Q_C = 0)', () => {
		const f = 1000;
		const omega = 2 * Math.PI * f;
		const L = 0.01;
		const C = 1 / (omega * omega * L); // exact resonant capacitance

		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: f,
			components: [
				comp('I1', 'current_source', 0, 2, 270, '2∠0°'),
				comp('R1', 'resistor', 4, 2, 90, '500'),
				comp('L1', 'inductor', 8, 2, 90, String(L)),
				comp('C1', 'capacitor', 12, 2, 90, String(C)),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w_top', [0, 0], [12, 0]), wire('w_bot', [0, 4], [12, 4])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);

		const vTank = sol.branches['R1'].voltage;
		expect(vTank.re).toBeCloseTo(1000, 8);
		expect(vTank.im).toBeCloseTo(0, 8);
		expect(sol.branches['R1'].current.equals(Complex.from(2, 0), 1e-9)).toBe(true);
		expect(sol.branches['L1'].current.add(sol.branches['C1'].current).abs()).toBeCloseTo(0, 9);
		expect(sol.branches['L1'].reactivePower + sol.branches['C1'].reactivePower).toBeCloseTo(0, 7);
	});

	// 12. Multi-source AC Phasor Circuit (10∠0° V and 5∠90° V)
	it('12. Multi-source AC Phasor Circuit (10∠0° V and 5∠90° V -> V_N2 = 5 + j0 V)', () => {
		const freq = 100 / (2 * Math.PI); // omega = 100
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: freq,
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '10∠0°'),
				comp('R1', 'resistor', 2, 0, 0, '10'), // (0,0)-(4,0)
				comp('L1', 'inductor', 4, 2, 90, '0.1'), // (4,0)-(4,4) -> j10
				comp('C1', 'capacitor', 6, 0, 0, '1m'), // (4,0)-(8,0) -> -j10
				comp('V2', 'voltage_source', 8, 2, 90, '5∠90°'), // (8,0)-(8,4) -> j5
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w_gnd', [0, 4], [8, 4])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['L1'].voltage.equals(Complex.from(5, 0), 1e-9)).toBe(true);
		expect(sol.branches['R1'].current.equals(Complex.from(0.5, 0), 1e-9)).toBe(true);
		expect(sol.branches['L1'].current.equals(Complex.from(0, -0.5), 1e-9)).toBe(true);
		expect(sol.branches['C1'].current.equals(Complex.from(0.5, 0.5), 1e-9)).toBe(true);
	});

	// 13. AC Mixed Voltage + Current Source Circuit
	it('13. AC Mixed Voltage + Current Source (10∠0° V, j1 A -> V_N2 = 10 V)', () => {
		const freq = 1000 / (2 * Math.PI);
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: freq,
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '10', { phaseDeg: 0 }),
				comp('R1', 'resistor', 2, 0, 0, '10'),
				comp('C1', 'capacitor', 4, 2, 90, '100u'),
				comp('I1', 'current_source', 8, 2, 270, '1', { phaseDeg: 90 }),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w_top', [4, 0], [8, 0]), wire('w_bot', [0, 4], [8, 4])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['C1'].voltage.equals(Complex.from(10, 0), 1e-9)).toBe(true);
		expect(sol.branches['R1'].current.abs()).toBeCloseTo(0, 9);
		expect(sol.branches['C1'].current.equals(Complex.from(0, 1), 1e-9)).toBe(true);
	});

	// 14. AC Peak Magnitude Mode Power Factor 0.5
	it('14. AC Peak Mode Power Calculation (S = 0.5 * V * I*)', () => {
		const freq = 1000 / (2 * Math.PI);
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: freq,
			acMagnitudeMode: 'peak',
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '100∠0°'),
				comp('R1', 'resistor', 2, 0, 0, '30'),
				comp('L1', 'inductor', 6, 0, 0, '80m'),
				comp('C1', 'capacitor', 8, 2, 90, '25u'),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w_gnd', [0, 4], [8, 4])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['R1'].realPower).toBeCloseTo(60, 9);
		expect(sol.branches['L1'].reactivePower).toBeCloseTo(160, 9);
		expect(sol.branches['C1'].reactivePower).toBeCloseTo(-80, 9);
		expect(sol.branches['V1'].realPower).toBeCloseTo(-60, 9);
	});

	// 15. Auto-ground + T-junction + 180-degree rotated source
	it('15. Auto-ground + T-junction + 180° rotated voltage source', () => {
		// V1 rotated 270 -> +:(0,4), -:(0,0) (inverted polarity!)
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 2, 270, '12'),
				comp('R1', 'resistor', 2, 0, 0, '2k'),
				comp('R2', 'resistor', 4, 2, 90, '4k')
			],
			wires: [
				wire('w_bot', [0, 4], [8, 4]),
				// T-junction from R2 bottom (4,4) already lies on w_bot! Also add terminal tap
				comp('T1', 'terminal', 4, 0, 0, '', { terminalName: 'A' }) as never
			].filter((x): x is ReturnType<typeof wire> => 'points' in x)
		};
		doc.components.push(comp('T1', 'terminal', 4, 0, 0, '', { terminalName: 'A' }));

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.diagnostics.some((d) => d.code === 'AUTO_GROUND')).toBe(true);
		// Auto-ground picks V1's negative pin (0,0)! So (0,4) is +12V, (4,0) is 0V?
		// Wait: V1+ is (0,4), V1- is (0,0)='0'. R1 connects (0,0)[0] to (4,0)[N1]. R2 connects (4,0)[N1] to (4,4)[+12V].
		// So V(N1) = 12 * 2k/(2k+4k) = 4V! And V_R2 = V(N1) - V(4,4) = 4 - 12 = -8V!
		expect(sol.branches['R2'].voltage.re).toBeCloseTo(-8, 9);
		expect(sol.branches['R1'].voltage.re).toBeCloseTo(-4, 9);
	});

	// 16. Error diagnostics suite
	it('16. Rejects voltage-source loop, open current source, floating resistor, and negative R', () => {
		// 16a: Parallel voltage sources (loop)
		const vLoop: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '10'),
				comp('V2', 'voltage_source', 4, 2, 90, '5'),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w1', [0, 0], [4, 0]), wire('w2', [0, 4], [4, 4])]
		};
		const s1 = solveMNA(vLoop);
		expect(s1.valid).toBe(false);
		expect(s1.diagnostics.some((d) => d.code === 'VOLTAGE_SOURCE_LOOP')).toBe(true);

		// 16b: Open current source
		const openCS: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('I1', 'current_source', 0, 2, 270, '2'),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: []
		};
		const s2 = solveMNA(openCS);
		expect(s2.valid).toBe(false);
		expect(s2.diagnostics.some((d) => d.code === 'CURRENT_SOURCE_CUTSET')).toBe(true);

		// 16c: Floating disconnected resistor island
		const floating: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '10'),
				comp('R1', 'resistor', 4, 2, 90, '100'),
				comp('R_float', 'resistor', 20, 20, 0, '50'),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w1', [0, 0], [4, 0]), wire('w2', [0, 4], [4, 4])]
		};
		const s3 = solveMNA(floating);
		expect(s3.valid).toBe(false);
		expect(s3.diagnostics.some((d) => d.code === 'FLOATING_SUBCIRCUIT')).toBe(true);

		// 16d: Negative resistance
		const negR: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '10'),
				comp('R1', 'resistor', 4, 2, 90, '-100'),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w1', [0, 0], [4, 0]), wire('w2', [0, 4], [4, 4])]
		};
		const s4 = solveMNA(negR);
		expect(s4.valid).toBe(false);
		expect(s4.diagnostics.some((d) => d.code === 'INVALID_VALUE')).toBe(true);
	});

	// 17. Lossless parallel LC tank driven by current source at resonance -> SINGULAR_MATRIX
	it('17. Reports SINGULAR_MATRIX cleanly for lossless parallel LC tank at resonance', () => {
		const f = 1000;
		const omega = 2 * Math.PI * f;
		const L = 0.01;
		const C = 1 / (omega * omega * L);

		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: f,
			components: [
				comp('I1', 'current_source', 0, 2, 270, '1'),
				comp('L1', 'inductor', 4, 2, 90, String(L)),
				comp('C1', 'capacitor', 8, 2, 90, String(C)),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w1', [0, 0], [8, 0]), wire('w2', [0, 4], [8, 4])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(false);
		expect(sol.diagnostics.some((d) => d.code === 'SINGULAR_MATRIX')).toBe(true);
	});

	// 18. Direct AC Impedance Specification (pure reactive, lossy complex, plain reactance, and DC fallback)
	it('18. Solves direct AC impedance inductors/capacitors with exact power balance and DC fallback', () => {
		// 18a: Series circuit: V1 = 10∠0° V, R1 = 1 Ω, L1 = 2+j1 Ω (lossy), C1 = -j5 Ω (plain "5" in impedance mode)
		// Z_total = 1 + (2 + j1) + (-j5) = 3 - j4 Ω => |Z| = 5 Ω => I = 10 / (3 - j4) = 1.2 + j1.6 A
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: 60,
			components: [
				comp('V1', 'voltage_source', 0, 2, 90, '10∠0°'),
				comp('R1', 'resistor', 2, 0, 0, '1'),
				comp('L1', 'inductor', 6, 0, 0, '2+j1', { valueMode: 'impedance', unit: 'Ω' }),
				comp('C1', 'capacitor', 8, 2, 90, '5', { valueMode: 'impedance', unit: 'Ω' }),
				comp('G1', 'ground', 0, 4, 0, '0')
			],
			wires: [wire('w_gnd', [0, 4], [8, 4])]
		};

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(Math.abs(sol.powerBalance.totalRealPower)).toBeLessThan(1e-10);
		expect(Math.abs(sol.powerBalance.totalReactivePower)).toBeLessThan(1e-10);
		expect(sol.branches['L1'].impedance?.equals(Complex.from(2, 1), 1e-12)).toBe(true);
		expect(sol.branches['C1'].impedance?.equals(Complex.j(-5), 1e-12)).toBe(true);
		expect(sol.branches['R1'].current.equals(Complex.from(1.2, 1.6), 1e-9)).toBe(true);
		// P_R1 = |I|^2 * 1 = 4 W, P_L1 = |I|^2 * 2 = 8 W, P_V1 = -12 W
		expect(sol.branches['R1'].realPower).toBeCloseTo(4, 9);
		expect(sol.branches['L1'].realPower).toBeCloseTo(8, 9);
		expect(sol.branches['L1'].reactivePower).toBeCloseTo(4, 9);
		expect(sol.branches['C1'].reactivePower).toBeCloseTo(-20, 9);
		expect(sol.branches['V1'].realPower).toBeCloseTo(-12, 9);

		// 18b: Same circuit in DC mode -> C1 is open (I = 0), L1 is short (V = 0)
		const dcSol = solveMNA({ ...doc, mode: 'dc', components: doc.components.map((c) => (c.id === 'V1' ? { ...c, value: '10' } : c)) });
		expect(dcSol.valid).toBe(true);
		expect(dcSol.branches['C1'].current.abs()).toBeCloseTo(0, 12);
		expect(dcSol.branches['C1'].voltage.re).toBeCloseTo(10, 12);
		expect(dcSol.branches['L1'].voltage.abs()).toBeCloseTo(0, 12);
		expect(dcSol.branches['L1'].current.abs()).toBeCloseTo(0, 12);

		// 18c: Rejects zero impedance and negative real resistance
		const zeroZ = solveMNA({
			...doc,
			components: doc.components.map((c) => (c.id === 'L1' ? { ...c, value: '0' } : c))
		});
		expect(zeroZ.valid).toBe(false);
		expect(zeroZ.diagnostics.some((d) => d.code === 'INVALID_VALUE')).toBe(true);

		const negRealZ = solveMNA({
			...doc,
			components: doc.components.map((c) => (c.id === 'L1' ? { ...c, value: '-2+j1' } : c))
		});
		expect(negRealZ.valid).toBe(false);
		expect(negRealZ.diagnostics.some((d) => d.code === 'INVALID_VALUE')).toBe(true);
	});
});
