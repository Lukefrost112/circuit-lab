import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../data/presets';
import {
	buildShareableUrl,
	decodeCircuitFromHash,
	encodeCircuitToHash,
	encodeCircuitToHashUncompressed,
	type ShareableCircuitPayload
} from '../share';
import { solveCircuit } from '../solve';
import type { CircuitDocument, TheveninTarget, UnitSystemId } from '../types';

function makeDcDividerDoc(): CircuitDocument {
	return {
		schemaVersion: 1,
		id: 'dc-share-divider',
		name: 'Shareable DC Divider',
		mode: 'dc',
		frequencyHz: 60,
		unitSystem: 'kohm-v-ma',
		components: [
			{
				id: 'V1',
				kind: 'voltage_source',
				label: 'V1',
				x: 4,
				y: 8,
				rotation: 90,
				value: '12',
				unit: 'V'
			},
			{
				id: 'R1',
				kind: 'resistor',
				label: 'R1',
				x: 8,
				y: 4,
				rotation: 0,
				value: '2k',
				unit: 'Ω'
			},
			{
				id: 'R2',
				kind: 'resistor',
				label: 'R2',
				x: 12,
				y: 8,
				rotation: 90,
				value: '4k',
				unit: 'Ω'
			},
			{
				id: 'G1',
				kind: 'ground',
				label: 'GND',
				x: 4,
				y: 10,
				rotation: 0,
				value: '0'
			}
		],
		wires: [
			{ id: 'w1', points: [{ x: 4, y: 6 }, { x: 4, y: 4 }, { x: 6, y: 4 }] },
			{ id: 'w2', points: [{ x: 10, y: 4 }, { x: 12, y: 4 }, { x: 12, y: 6 }] },
			{ id: 'w3', points: [{ x: 4, y: 10 }, { x: 12, y: 10 }] }
		]
	};
}

function makeAcRlcDoc(): CircuitDocument {
	return {
		schemaVersion: 1,
		id: 'ac-share-rlc',
		name: 'AC Phasor RLC Network',
		mode: 'ac',
		frequencyHz: 1000,
		acMagnitudeMode: 'peak',
		unitSystem: 'ohm-v-a',
		components: [
			{
				id: 'V1',
				kind: 'voltage_source',
				label: 'Vs',
				x: 4,
				y: 8,
				rotation: 90,
				value: '120∠30°',
				phaseDeg: 30,
				unit: 'V'
			},
			{
				id: 'R1',
				kind: 'resistor',
				label: 'R1',
				x: 8,
				y: 4,
				rotation: 0,
				value: '100',
				unit: 'Ω'
			},
			{
				id: 'L1',
				kind: 'inductor',
				label: 'L1',
				x: 14,
				y: 4,
				rotation: 0,
				value: '20m',
				unit: 'H'
			},
			{
				id: 'C1',
				kind: 'capacitor',
				label: 'C1',
				x: 18,
				y: 8,
				rotation: 90,
				value: '2.2u',
				unit: 'F'
			},
			{
				id: 'G1',
				kind: 'ground',
				label: 'GND',
				x: 4,
				y: 10,
				rotation: 0,
				value: '0'
			}
		],
		wires: [
			{ id: 'w1', points: [{ x: 4, y: 6 }, { x: 4, y: 4 }, { x: 6, y: 4 }] },
			{ id: 'w2', points: [{ x: 10, y: 4 }, { x: 12, y: 4 }] },
			{ id: 'w3', points: [{ x: 16, y: 4 }, { x: 18, y: 4 }, { x: 18, y: 6 }] },
			{ id: 'w4', points: [{ x: 4, y: 10 }, { x: 18, y: 10 }] }
		]
	};
}

function makeUnknownProblemDoc(): CircuitDocument {
	const base = makeDcDividerDoc();
	return {
		...base,
		id: 'unknown-vs-problem',
		name: 'Find Vs Given Io = 3 mA',
		unknownProblem: {
			componentId: 'V1',
			symbol: 'Vs',
			constraint: {
				kind: 'branch_current',
				targetId: 'R2',
				value: '3m',
				label: 'I_o'
			}
		}
	};
}

describe('Shareable Circuit URL Codec (share.ts)', () => {
	it('round-trips a DC circuit via compressed #c=v1. hash and produces URL-safe compact output', async () => {
		const doc = makeDcDividerDoc();
		const payload: ShareableCircuitPayload = {
			document: doc,
			theveninTarget: { kind: 'component', componentId: 'R2' },
			unitSystem: 'kohm-v-ma'
		};

		const hash = await encodeCircuitToHash(payload);
		expect(hash).toMatch(/^#c=v1\.[A-Za-z0-9_-]+$/);

		const rawJson = JSON.stringify(payload);
		expect(hash.length).toBeLessThan(rawJson.length);

		const decoded = await decodeCircuitFromHash(hash);
		expect(decoded).not.toBeNull();
		if (!decoded) return;

		expect(decoded.document.id).toBe(doc.id);
		expect(decoded.document.name).toBe(doc.name);
		expect(decoded.document.mode).toBe('dc');
		expect(decoded.document.components).toHaveLength(doc.components.length);
		expect(decoded.document.wires).toHaveLength(doc.wires.length);
		expect(decoded.theveninTarget).toEqual({ kind: 'component', componentId: 'R2' });
		expect(decoded.unitSystem).toBe('kohm-v-ma');

		const origSol = solveCircuit(doc, { theveninTarget: payload.theveninTarget });
		const decodedSol = solveCircuit(decoded.document, { theveninTarget: decoded.theveninTarget });
		expect(decodedSol.mna.valid).toBe(true);
		expect(decodedSol.mna.branches['R2'].voltage.re).toBeCloseTo(
			origSol.mna.branches['R2'].voltage.re,
			9
		);
		expect(decodedSol.theveninNorton?.vth.re).toBeCloseTo(origSol.theveninNorton!.vth.re, 9);
	});

	it('round-trips an AC circuit preserving frequencyHz, acMagnitudeMode, and phasors', async () => {
		const doc = makeAcRlcDoc();
		const hash = await encodeCircuitToHash({
			document: doc,
			unitSystem: 'ohm-v-a'
		});
		expect(hash).toMatch(/^#c=v1\.[A-Za-z0-9_-]+$/);

		const decoded = await decodeCircuitFromHash(hash);
		expect(decoded).not.toBeNull();
		if (!decoded) return;

		expect(decoded.document.mode).toBe('ac');
		expect(decoded.document.frequencyHz).toBe(1000);
		expect(decoded.document.acMagnitudeMode).toBe('peak');
		const v1 = decoded.document.components.find((c) => c.id === 'V1');
		expect(v1?.value).toBe('120∠30°');
		expect(v1?.phaseDeg).toBe(30);

		const origSol = solveCircuit(doc, {
			frequencyHz: doc.frequencyHz,
			acMagnitudeMode: doc.acMagnitudeMode
		});
		const decodedSol = solveCircuit(decoded.document, {
			frequencyHz: decoded.document.frequencyHz,
			acMagnitudeMode: decoded.document.acMagnitudeMode
		});
		expect(decodedSol.mna.valid).toBe(true);
		expect(decodedSol.mna.branches['C1'].voltage.re).toBeCloseTo(
			origSol.mna.branches['C1'].voltage.re,
			9
		);
		expect(decodedSol.mna.branches['C1'].voltage.im).toBeCloseTo(
			origSol.mna.branches['C1'].voltage.im,
			9
		);
	});

	it('round-trips a circuit with unknownProblem and solves to the identical unknown value', async () => {
		const doc = makeUnknownProblemDoc();
		const origSol = solveCircuit(doc);
		expect(origSol.unknownSolution?.valid).toBe(true);
		expect(origSol.unknownSolution?.solutions[0].value.re).toBeCloseTo(18, 9);

		const hash = await encodeCircuitToHash({
			document: doc,
			unitSystem: 'kohm-v-ma'
		});
		const decoded = await decodeCircuitFromHash(hash);
		expect(decoded).not.toBeNull();
		if (!decoded) return;

		expect(decoded.document.unknownProblem).toEqual({
			componentId: 'V1',
			symbol: 'Vs',
			constraint: {
				kind: 'branch_current',
				targetId: 'R2',
				value: '3m',
				label: 'I_o'
			}
		});

		const decodedSol = solveCircuit(decoded.document);
		expect(decodedSol.unknownSolution?.valid).toBe(true);
		expect(decodedSol.unknownSolution?.solutions[0].value.re).toBeCloseTo(
			origSol.unknownSolution!.solutions[0].value.re,
			9
		);
		expect(decodedSol.unknownSolution?.solutions[0].valueString).toBe(
			origSol.unknownSolution!.solutions[0].valueString
		);
	});

	it('round-trips both component and terminals Thevenin targets and all 4 unit systems', async () => {
		const doc = makeDcDividerDoc();
		const targets: TheveninTarget[] = [
			{ kind: 'component', componentId: 'R2' },
			{ kind: 'terminals', nodeA: 'N2', nodeB: '0' }
		];
		const unitSystems: UnitSystemId[] = ['auto', 'ohm-v-a', 'kohm-v-ma', 'mohm-v-ua'];

		for (const target of targets) {
			for (const unitSystem of unitSystems) {
				const hash = await encodeCircuitToHash({
					document: { ...doc, unitSystem },
					theveninTarget: target,
					unitSystem
				});
				const decoded = await decodeCircuitFromHash(hash);
				expect(decoded).not.toBeNull();
				if (!decoded) continue;
				expect(decoded.theveninTarget).toEqual(target);
				expect(decoded.unitSystem).toBe(unitSystem);
				expect(decoded.document.unitSystem).toBe(unitSystem);
			}
		}
	});

	it('round-trips uncompressed #c=u1. fallback identically and supports multi-param / hashless formats', async () => {
		const preset = PRESETS[0];
		const payload: ShareableCircuitPayload = {
			document: preset.document,
			theveninTarget: preset.theveninLoadId
				? { kind: 'component', componentId: preset.theveninLoadId }
				: undefined,
			unitSystem: 'auto'
		};

		const uHash = encodeCircuitToHashUncompressed(payload);
		expect(uHash).toMatch(/^#c=u1\.[A-Za-z0-9_-]+$/);

		const decoded1 = await decodeCircuitFromHash(uHash);
		expect(decoded1).not.toBeNull();
		expect(decoded1?.document.id).toBe(preset.document.id);
		expect(decoded1?.theveninTarget).toEqual(payload.theveninTarget);
		expect(decoded1?.unitSystem).toBe('auto');

		// Without leading '#'
		const decodedNoSharp = await decodeCircuitFromHash(uHash.slice(1));
		expect(decodedNoSharp?.document.id).toBe(preset.document.id);

		// Multi-parameter hash
		const decodedMulti = await decodeCircuitFromHash(`#view=1&${uHash.slice(1)}&tab=results`);
		expect(decodedMulti?.document.id).toBe(preset.document.id);
	});

	it('preserves base paths, origins, and query params in buildShareableUrl', () => {
		expect(
			buildShareableUrl('https://omar-ezeldin.github.io/circuit-lab/', '#c=v1.abc')
		).toBe('https://omar-ezeldin.github.io/circuit-lab/#c=v1.abc');

		expect(
			buildShareableUrl(
				'https://omar-ezeldin.github.io/circuit-lab/?theme=dark#c=v1.old',
				'#c=v1.new_123-XYZ'
			)
		).toBe('https://omar-ezeldin.github.io/circuit-lab/?theme=dark#c=v1.new_123-XYZ');
	});

	function utf8ToBase64Url(text: string): string {
		const bytes = new TextEncoder().encode(text);
		let binary = '';
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
	}

	it('returns null cleanly without throwing on empty, garbage, truncated, invalid, or oversized hashes', async () => {
		const validHash = await encodeCircuitToHash({ document: makeDcDividerDoc() });
		const truncated = validHash.slice(0, Math.floor(validHash.length / 2));

		// Valid base64url of invalid JSON
		const invalidJsonB64 = utf8ToBase64Url('{not valid json');

		// Valid JSON but invalid circuit schema (missing components / bad mode)
		const badSchemaB64 = utf8ToBase64Url(
			JSON.stringify({ v: 1, d: { schemaVersion: 1, mode: 'quantum', components: 'nope' } })
		);

		// Unsupported envelope version
		const badVersionB64 = utf8ToBase64Url(JSON.stringify({ v: 99, d: makeDcDividerDoc() }));

		// Oversized hash (> 120_000 chars)
		const oversized = `#c=u1.${'A'.repeat(120_010)}`;

		const badInputs = [
			'',
			'#',
			'#other=123',
			'#c=',
			'#c=v2.abc',
			'#c=v1.!!!not_base64!!!',
			'#c=u1.a', // invalid base64 length mod 4 === 1
			'#c=v1.AAAA', // invalid deflate stream
			truncated,
			`#c=u1.${invalidJsonB64}`,
			`#c=u1.${badSchemaB64}`,
			`#c=u1.${badVersionB64}`,
			oversized
		];

		for (const input of badInputs) {
			const result = await decodeCircuitFromHash(input);
			expect(result).toBeNull();
		}
	});

	it('ignores invalid optional theveninTarget and unitSystem while keeping valid circuit', async () => {
		const payloadWithInvalidMeta = {
			v: 1,
			d: makeDcDividerDoc(),
			t: { kind: 'component', componentId: 'NON_EXISTENT' },
			u: 'imperial-feet'
		};
		const b64 = utf8ToBase64Url(JSON.stringify(payloadWithInvalidMeta));

		const decoded = await decodeCircuitFromHash(`#c=u1.${b64}`);
		expect(decoded).not.toBeNull();
		expect(decoded?.document.id).toBe('dc-share-divider');
		expect(decoded?.theveninTarget).toBeUndefined();
		expect(decoded?.unitSystem).toBeUndefined();
	});
});
