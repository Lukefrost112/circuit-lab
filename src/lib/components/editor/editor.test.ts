import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { PRESETS } from '$lib/data/presets';
import { Complex } from '$lib/engine';
import { circuit } from '$lib/stores/circuit.svelte';
import { settings } from '$lib/stores/settings.svelte';
import {
	ComponentPalette,
	EngineeringInput,
	PropertyInspector,
	SchematicCanvas,
	computeJunctionPoints,
	computeManhattanPoints,
	formatComplexOverlay,
	formatComponentDisplayValue
} from './index';

beforeEach(() => {
	circuit.resetToDefault();
	settings.reset();
});

afterEach(() => {
	circuit.resetToDefault();
	settings.reset();
});

describe('editor geometry & formatting helpers', () => {
	it('computes orthogonal Manhattan L-bends in H-then-V and V-then-H modes', () => {
		expect(computeManhattanPoints({ x: 2, y: 4 }, { x: 8, y: 10 }, 'hv')).toEqual([
			{ x: 2, y: 4 },
			{ x: 8, y: 4 },
			{ x: 8, y: 10 }
		]);
		expect(computeManhattanPoints({ x: 2, y: 4 }, { x: 8, y: 10 }, 'vh')).toEqual([
			{ x: 2, y: 4 },
			{ x: 2, y: 10 },
			{ x: 8, y: 10 }
		]);
		expect(computeManhattanPoints({ x: 2, y: 4 }, { x: 8, y: 4 }, 'hv')).toEqual([
			{ x: 2, y: 4 },
			{ x: 8, y: 4 }
		]);
	});

	it('detects automatic junction dots wherever 3+ segments or pins meet', () => {
		const doc = PRESETS[0].document;
		const junctions = computeJunctionPoints(doc.components, doc.wires);
		const keys = new Set(junctions.map((j) => `${j.x},${j.y}`));

		// In dc-divider preset: (12,4) T-junction, (12,10) R2+bottom wire, (4,10) V1+G1+bottom wire
		expect(keys.has('12,4')).toBe(true);
		expect(keys.has('12,10')).toBe(true);
		expect(keys.has('4,10')).toBe(true);

		// Corners and 2-connection pins must NOT produce junction dots
		expect(keys.has('4,4')).toBe(false);
		expect(keys.has('4,6')).toBe(false);
		expect(keys.has('18,4')).toBe(false);
	});

	it('formats component values and live V/I overlays cleanly', () => {
		const r1 = PRESETS[0].document.components.find((c) => c.id === 'R1')!;
		expect(formatComponentDisplayValue(r1, 'dc')).toBe('2 kΩ');

		expect(
			formatComplexOverlay(Complex.from(10 / 3, 0), 'V', 'dc', {
				precision: 3,
				angleDisplay: 'polar',
				showDcFractions: true
			})
		).toBe('10/3 V');

		expect(
			formatComplexOverlay(Complex.from(0.004, 0), 'A', 'dc', {
				precision: 3,
				angleDisplay: 'polar',
				showDcFractions: true
			})
		).toBe('4 mA');

		expect(
			formatComplexOverlay(Complex.fromPolar(120, -30), 'V', 'ac', {
				precision: 3,
				angleDisplay: 'polar',
				showDcFractions: true
			})
		).toBe('120∠-30° V');
	});
});

describe('editor Svelte components SSR rendering', () => {
	it('renders EngineeringInput with formatted SI readout and validation error states', () => {
		const validOut = render(EngineeringInput, {
			props: { value: '10k', unit: 'Ω' }
		});
		expect(validOut.body).toContain('= 10 kΩ');
		expect(validOut.body).not.toContain('aria-invalid="true"');

		const invalidOut = render(EngineeringInput, {
			props: { value: 'bad-val', unit: 'Ω', positiveOnly: true }
		});
		expect(invalidOut.body).toContain('aria-invalid="true"');
		expect(invalidOut.body).toContain('Invalid engineering value');

		const acOut = render(EngineeringInput, {
			props: { value: '120∠30°', unit: 'V', allowComplex: true }
		});
		expect(acOut.body).toContain('120∠30° V');
	});

	it('renders ComponentPalette with unified CircuitSymbol icons and shortcuts', () => {
		const out = render(ComponentPalette);
		expect(out.body).toContain('Component Palette');
		expect(out.body).toContain('Select / Move');
		expect(out.body).toContain('DC Voltage Source');
		expect(out.body).toContain('Orthogonal Wire');
		expect(out.body).toContain('data-symbol-kind="resistor"');
		expect(out.body).toContain('Rotate');
	});

	it('renders PropertyInspector for empty selection, component selection, and wire selection', () => {
		const emptyOut = render(PropertyInspector);
		expect(emptyOut.body).toContain('No Element Selected');
		expect(emptyOut.body).toContain('Simulation Parameters');

		circuit.selectComponent('R3');
		const compOut = render(PropertyInspector);
		expect(compOut.body).toContain('R3');
		expect(compOut.body).toContain('Clear Thévenin / Norton Target');

		circuit.selectWire('w1');
		const wireOut = render(PropertyInspector);
		expect(wireOut.body).toContain('Selected Wire');
		expect(wireOut.body).toContain('w1');
	});

	it('renders SchematicCanvas with live overlays, IEEE/IEC symbols, and empty state when cleared', () => {
		const populatedOut = render(SchematicCanvas);
		expect(populatedOut.body).toContain('data-component-id="R1"');
		expect(populatedOut.body).toContain('data-symbol-standard="ieee"');
		expect(populatedOut.body).toContain('Load (Thévenin)');
		expect(populatedOut.body).toContain('N1:');

		settings.schematicStandard = 'iec';
		const iecOut = render(SchematicCanvas);
		expect(iecOut.body).toContain('data-symbol-standard="iec"');

		circuit.clearCircuit();
		const emptyOut = render(SchematicCanvas);
		expect(emptyOut.body).toContain('Place a component or load a preset to begin');
	});
});
