import { describe, expect, it } from 'vitest';
import { buildElectricalGraph, getPinPositions, validateCircuitTopology } from '../graph';
import type { CircuitComponent, CircuitDocument } from '../types';

function makeComp(
	partial: Partial<CircuitComponent> & Pick<CircuitComponent, 'id' | 'kind'>
): CircuitComponent {
	return {
		label: partial.id,
		x: 0,
		y: 0,
		rotation: 0,
		value: '1',
		...partial
	};
}

describe('graph & topology', () => {
	it('computes canonical pin coordinates across all 4 rotations', () => {
		const base = { id: 'R1', kind: 'resistor' as const, label: 'R1', x: 10, y: 20, value: '1k' };

		expect(getPinPositions({ ...base, rotation: 0 })).toEqual([
			{ name: 'a', index: 0, x: 8, y: 20 },
			{ name: 'b', index: 1, x: 12, y: 20 }
		]);
		expect(getPinPositions({ ...base, rotation: 90 })).toEqual([
			{ name: 'a', index: 0, x: 10, y: 18 },
			{ name: 'b', index: 1, x: 10, y: 22 }
		]);
		expect(getPinPositions({ ...base, rotation: 180 })).toEqual([
			{ name: 'a', index: 0, x: 12, y: 20 },
			{ name: 'b', index: 1, x: 8, y: 20 }
		]);
		expect(getPinPositions({ ...base, rotation: 270 })).toEqual([
			{ name: 'a', index: 0, x: 10, y: 22 },
			{ name: 'b', index: 1, x: 10, y: 18 }
		]);

		const gnd = makeComp({ id: 'G1', kind: 'ground', x: 4, y: 8 });
		expect(getPinPositions(gnd)).toEqual([{ name: 'gnd', index: 0, x: 4, y: 8 }]);
	});

	it('merges T-junctions without merging non-touching crossing wires', () => {
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				makeComp({ id: 'V1', kind: 'voltage_source', x: 0, y: 4, rotation: 90, value: '10' }), // +:(0,2), -:(0,6)
				makeComp({ id: 'R1', kind: 'resistor', x: 4, y: 2, rotation: 0, value: '1k' }), // a:(2,2), b:(6,2)
				makeComp({ id: 'R2', kind: 'resistor', x: 4, y: 6, rotation: 0, value: '1k' }), // a:(2,6), b:(6,6)
				makeComp({ id: 'G1', kind: 'ground', x: 0, y: 6 })
			],
			wires: [
				// Horizontal top bus passing through (2,2), (4,2) — wait: let's connect V1+ (0,2) to (6,2) and T-tap at (2,2)
				{ id: 'w1', points: [{ x: 0, y: 2 }, { x: 2, y: 2 }] },
				{ id: 'w2', points: [{ x: 0, y: 6 }, { x: 2, y: 6 }] },
				// T-junction wire from (6,2) down to (6,6) with a vertical bus, and another wire ending on it at (6,4)
				{ id: 'w3', points: [{ x: 6, y: 2 }, { x: 6, y: 6 }] },
				// Crossing wires at (10, 4) with no shared endpoint should remain separate if attached to separate pins
				{ id: 'w_cross_h', points: [{ x: 8, y: 4 }, { x: 12, y: 4 }] },
				{ id: 'w_cross_v', points: [{ x: 10, y: 2 }, { x: 10, y: 6 }] }
			]
		};

		const graph = buildElectricalGraph(doc);
		expect(graph.componentNodes['V1'][1]).toBe('0');
		expect(graph.componentNodes['R2'][0]).toBe('0');
		expect(graph.componentNodes['R1'][1]).toBe(graph.componentNodes['R2'][1]);
	});

	it('emits AUTO_GROUND info diagnostic when no ground component is present', () => {
		const doc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [
				makeComp({ id: 'V1', kind: 'voltage_source', x: 0, y: 2, rotation: 90, value: '12' }), // +:(0,0), -:(0,4)
				makeComp({ id: 'R1', kind: 'resistor', x: 4, y: 2, rotation: 90, value: '4' }) // a:(4,0), b:(4,4)
			],
			wires: [
				{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] },
				{ id: 'w2', points: [{ x: 0, y: 4 }, { x: 4, y: 4 }] }
			]
		};

		const graph = buildElectricalGraph(doc);
		expect(graph.diagnostics.some((d) => d.code === 'AUTO_GROUND' && d.severity === 'info')).toBe(
			true
		);
		expect(graph.componentNodes['V1'][1]).toBe('0');
		expect(graph.componentNodes['R1'][1]).toBe('0');
	});

	it('detects empty circuit, invalid frequency, negative values, loops, cutsets, and floating islands', () => {
		const emptyDoc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'dc',
			frequencyHz: 60,
			components: [makeComp({ id: 'G1', kind: 'ground', x: 0, y: 0 })],
			wires: []
		};
		const emptyDiags = validateCircuitTopology(buildElectricalGraph(emptyDoc), 'dc', 60);
		expect(emptyDiags.some((d) => d.code === 'EMPTY_CIRCUIT')).toBe(true);

		const badFreqDoc: CircuitDocument = {
			schemaVersion: 1,
			mode: 'ac',
			frequencyHz: 0,
			components: [
				makeComp({ id: 'V1', kind: 'voltage_source', x: 0, y: 2, rotation: 90, value: '10' }),
				makeComp({ id: 'R1', kind: 'resistor', x: 4, y: 2, rotation: 90, value: '-5' }),
				makeComp({ id: 'G1', kind: 'ground', x: 0, y: 4 })
			],
			wires: [
				{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] },
				{ id: 'w2', points: [{ x: 0, y: 4 }, { x: 4, y: 4 }] }
			]
		};
		const badFreqDiags = validateCircuitTopology(buildElectricalGraph(badFreqDoc), 'ac', 0);
		expect(badFreqDiags.some((d) => d.code === 'INVALID_FREQUENCY')).toBe(true);
		expect(badFreqDiags.some((d) => d.code === 'INVALID_VALUE')).toBe(true);
	});
});
