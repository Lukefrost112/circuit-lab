import { describe, expect, it } from 'vitest';
import { layoutNetlistToDocument } from '../auto-layout';
import { buildElectricalGraph } from '../graph';
import { AI_CIRCUIT_IMPORT_PROMPT, exportCircuitJson, parseCircuitImport } from '../io';
import { solveMNA } from '../mna';
import type { CircuitDocument } from '../types';

function assertNoComponentOverlap(doc: CircuitDocument): void {
	const active = doc.components;
	for (let i = 0; i < active.length; i++) {
		for (let j = i + 1; j < active.length; j++) {
			const a = active[i];
			const b = active[j];
			const dx = Math.abs(a.x - b.x);
			const dy = Math.abs(a.y - b.y);
			expect(dx === 0 && dy === 0).toBe(false);
		}
	}
}

describe('Circuit Lab JSON I/O, AI Import & Auto-Layout', () => {
	it('provides a complete AI_CIRCUIT_IMPORT_PROMPT with DC & AC examples and rules', () => {
		expect(AI_CIRCUIT_IMPORT_PROMPT).toContain('"resistor"');
		expect(AI_CIRCUIT_IMPORT_PROMPT).toContain('"voltage_source"');
		expect(AI_CIRCUIT_IMPORT_PROMPT).toContain('"current_source"');
		expect(AI_CIRCUIT_IMPORT_PROMPT).toContain('"0"');
		expect(AI_CIRCUIT_IMPORT_PROMPT).toContain('Example 1 (DC)');
		expect(AI_CIRCUIT_IMPORT_PROMPT).toContain('Example 2 (AC)');
		expect(AI_CIRCUIT_IMPORT_PROMPT).toContain('frequencyHz');
	});

	it('round-trips a full CircuitDocument through exportCircuitJson and parseCircuitImport', () => {
		const doc: CircuitDocument = {
			schemaVersion: 1,
			id: 'roundtrip-test',
			name: 'Roundtrip Divider',
			mode: 'dc',
			frequencyHz: 60,
			components: [
				{ id: 'V1', kind: 'voltage_source', label: 'V1', x: 4, y: 8, rotation: 90, value: '12' },
				{ id: 'R1', kind: 'resistor', label: 'R1', x: 8, y: 4, rotation: 0, value: '2k' },
				{ id: 'R2', kind: 'resistor', label: 'R2', x: 12, y: 8, rotation: 90, value: '4k' },
				{ id: 'G1', kind: 'ground', label: 'GND', x: 4, y: 10, rotation: 0, value: '0' }
			],
			wires: [
				{ id: 'w1', points: [{ x: 4, y: 6 }, { x: 4, y: 4 }, { x: 6, y: 4 }] },
				{ id: 'w2', points: [{ x: 10, y: 4 }, { x: 12, y: 4 }, { x: 12, y: 6 }] },
				{ id: 'w3', points: [{ x: 4, y: 10 }, { x: 12, y: 10 }] }
			]
		};

		const json1 = exportCircuitJson(doc);
		const parsed = parseCircuitImport(json1);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		expect(parsed.sourceFormat).toBe('circuit-document');
		expect(parsed.warnings).toEqual([]);
		expect(exportCircuitJson(parsed.document)).toBe(json1);

		const sol = solveMNA(parsed.document);
		expect(sol.valid).toBe(true);
		expect(sol.branches['R2'].voltage.re).toBeCloseTo(8, 9);
	});

	it('extracts markdown-fenced and prose-wrapped AI JSON netlists', () => {
		const rawResponse = `Here is the extracted circuit netlist from your schematic photo:

\`\`\`json
{
  "schemaVersion": 1,
  "name": "Fenced DC Divider",
  "mode": "dc",
  "elements": [
    { "id": "V1", "kind": "voltage_source", "label": "V1", "from": "N1", "to": "0", "value": "12" },
    { "id": "R1", "kind": "resistor", "label": "R1", "from": "N1", "to": "N2", "value": "2k" },
    { "id": "R2", "kind": "resistor", "label": "R2", "from": "N2", "to": "0", "value": "4k" }
  ]
}
\`\`\`

Let me know if you want node voltages calculated!`;

		const res = parseCircuitImport(rawResponse);
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		expect(res.sourceFormat).toBe('ai-netlist');
		expect(res.document.name).toBe('Fenced DC Divider');
		assertNoComponentOverlap(res.document);

		const sol = solveMNA(res.document);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['R2'].voltage.re).toBeCloseTo(8, 9);
		expect(sol.branches['R1'].current.re).toBeCloseTo(0.002, 9);
	});

	it('extracts unfenced JSON embedded in leading/trailing AI commentary', () => {
		const raw = `Sure! Here is the netlist: { "mode": "dc", "elements": [
			{ "id": "V1", "kind": "voltage_source", "from": "N1", "to": "0", "value": "10" },
			{ "id": "R1", "kind": "resistor", "from": "N1", "to": "0", "value": "5" }
		] } Hope that helps!`;

		const res = parseCircuitImport(raw);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		const sol = solveMNA(res.document);
		expect(sol.valid).toBe(true);
		expect(sol.branches['R1'].current.re).toBeCloseTo(2, 9);
	});

	it('reports crisp human-readable errors on invalid JSON and malformed inputs', () => {
		const emptyRes = parseCircuitImport('   ');
		expect(emptyRes.ok).toBe(false);

		const badJson = parseCircuitImport('{ not valid json');
		expect(badJson.ok).toBe(false);
		if (!badJson.ok) expect(badJson.errors[0]).toContain('Invalid JSON');

		const badFields = parseCircuitImport(
			JSON.stringify({
				mode: 'transient',
				elements: [
					{ id: 'R1', kind: 'transistor', from: 'N1', to: '0', value: '1k' },
					{ id: 'R2', kind: 'resistor', from: 'N1', to: '', value: '-10' },
					{ id: 'V1', kind: 'voltage_source', from: 'N1', to: '0', value: '' }
				]
			})
		);
		expect(badFields.ok).toBe(false);
		if (!badFields.ok) {
			expect(badFields.errors.some((e) => e.includes('"mode"'))).toBe(true);
			expect(badFields.errors.some((e) => e.includes('invalid kind'))).toBe(true);
			expect(badFields.errors.some((e) => e.includes('"to"'))).toBe(true);
			expect(badFields.errors.some((e) => e.includes('positive finite'))).toBe(true);
			expect(badFields.errors.some((e) => e.includes('"value"'))).toBe(true);
		}

		const missingAcFreq = parseCircuitImport(
			JSON.stringify({
				mode: 'ac',
				elements: [
					{ id: 'V1', kind: 'voltage_source', from: 'N1', to: '0', value: '10∠0°' },
					{ id: 'R1', kind: 'resistor', from: 'N1', to: '0', value: '10' }
				]
			})
		);
		expect(missingAcFreq.ok).toBe(false);
		if (!missingAcFreq.ok) {
			expect(missingAcFreq.errors.some((e) => e.includes('frequencyHz'))).toBe(true);
		}
	});

	it('auto-layout preserves exact Wheatstone bridge topology and analytical values', () => {
		const doc = layoutNetlistToDocument({
			name: 'Wheatstone Bridge',
			mode: 'dc',
			elements: [
				{ id: 'V1', kind: 'voltage_source', label: 'V1', from: 'N1', to: 'GND', value: '10' },
				{ id: 'R1', kind: 'resistor', label: 'R1', from: 'N1', to: 'N2', value: '100' },
				{ id: 'R2', kind: 'resistor', label: 'R2', from: 'N2', to: 'GND', value: '200' },
				{ id: 'R3', kind: 'resistor', label: 'R3', from: 'N1', to: 'N3', value: '300' },
				{ id: 'R4', kind: 'resistor', label: 'R4', from: 'N3', to: 'GND', value: '100' },
				{ id: 'R5', kind: 'resistor', label: 'R5', from: 'N2', to: 'N3', value: '150' }
			]
		});

		assertNoComponentOverlap(doc);

		const graph = buildElectricalGraph(doc);
		expect(graph.nonRefNodeIds.length).toBe(3);

		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		// Analytical check: Vth = 25/6 V, Rth = 425/3 ohm, R5 = 150 ohm => I(R5) = 1/70 A
		expect(sol.branches['R5'].current.re).toBeCloseTo(1 / 70, 9);
		expect(sol.branches['R5'].voltage.re).toBeCloseTo(150 / 70, 9);
	});

	it('auto-layout handles parallel series branches and parallel shunts without overlap or shorts', () => {
		const doc = layoutNetlistToDocument({
			mode: 'dc',
			elements: [
				// Current source pushing 6 A from 0 -> N1, parallel with R1=6 and R2=12 (equiv 4 ohm)
				{ id: 'I1', kind: 'current_source', from: '0', to: 'N1', value: '6' },
				{ id: 'R1', kind: 'resistor', from: 'N1', to: '0', value: '6' },
				{ id: 'R2', kind: 'resistor', from: 'N1', to: '0', value: '12' },
				// Two parallel resistors R3=6, R4=6 between N1 and N2 (equiv 3 ohm)
				{ id: 'R3', kind: 'resistor', from: 'N1', to: 'N2', value: '6' },
				{ id: 'R4', kind: 'resistor', from: 'N1', to: 'N2', value: '6' },
				// Two parallel load resistors R5=2, R6=2 from N2 to 0 (equiv 1 ohm)
				{ id: 'R5', kind: 'resistor', from: 'N2', to: '0', value: '2' },
				{ id: 'R6', kind: 'resistor', from: 'N2', to: '0', value: '2' }
			]
		});

		assertNoComponentOverlap(doc);

		const graph = buildElectricalGraph(doc);
		expect(graph.nonRefNodeIds.length).toBe(2);

		// Series branch from N1 to N2 to 0 has R_right = 3 + 1 = 4 ohm.
		// In parallel with R1||R2 = 4 ohm -> total Req seen by I1 = 2 ohm -> V(N1) = 12 V, V(N2) = 3 V!
		const sol = solveMNA(doc);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);
		expect(sol.branches['R1'].voltage.re).toBeCloseTo(12, 9);
		expect(sol.branches['R5'].voltage.re).toBeCloseTo(3, 9);
		expect(sol.branches['R3'].current.re).toBeCloseTo(1.5, 9);
		expect(sol.branches['R4'].current.re).toBeCloseTo(1.5, 9);
	});

	it('auto-layout preserves exact AC RLC topology and complex phasor solution', () => {
		const res = parseCircuitImport(
			JSON.stringify({
				schemaVersion: 1,
				name: 'AC RLC Test',
				mode: 'ac',
				frequencyHz: 1000,
				acMagnitudeMode: 'rms',
				elements: [
					{ id: 'V1', kind: 'voltage_source', from: 'N1', to: '0', value: '10∠30°' },
					{ id: 'R1', kind: 'resistor', from: 'N1', to: 'N2', value: '100' },
					{ id: 'L1', kind: 'inductor', from: 'N2', to: 'N3', value: '20m' },
					{ id: 'C1', kind: 'capacitor', from: 'N3', to: '0', value: '2.2u' },
					{ id: 'R2', kind: 'resistor', from: 'N3', to: '0', value: '100' }
				]
			})
		);

		expect(res.ok).toBe(true);
		if (!res.ok) return;

		assertNoComponentOverlap(res.document);

		const graph = buildElectricalGraph(res.document);
		expect(graph.nonRefNodeIds.length).toBe(3);

		const sol = solveMNA(res.document);
		expect(sol.valid).toBe(true);
		expect(sol.powerBalance.balanced).toBe(true);

		// Analytical impedance check at f = 1000 Hz
		const omega = 2 * Math.PI * 1000;
		const zLoadRe = 1 / (1 / 100); // Y_R2 = 0.01
		const yLoadRe = 0.01;
		const yLoadIm = omega * 2.2e-6;
		const yMagSq = yLoadRe * yLoadRe + yLoadIm * yLoadIm;
		const zParRe = yLoadRe / yMagSq;
		const zParIm = -yLoadIm / yMagSq;
		const zTotRe = 100 + zParRe;
		const zTotIm = omega * 20e-3 + zParIm;

		const vSrc = {
			re: 10 * Math.cos((30 * Math.PI) / 180),
			im: 10 * Math.sin((30 * Math.PI) / 180)
		};
		const zTotMagSq = zTotRe * zTotRe + zTotIm * zTotIm;
		const iTotRe = (vSrc.re * zTotRe + vSrc.im * zTotIm) / zTotMagSq;
		const iTotIm = (vSrc.im * zTotRe - vSrc.re * zTotIm) / zTotMagSq;

		expect(zLoadRe).toBe(100);
		expect(sol.branches['R1'].current.re).toBeCloseTo(iTotRe, 9);
		expect(sol.branches['R1'].current.im).toBeCloseTo(iTotIm, 9);
	});
});
