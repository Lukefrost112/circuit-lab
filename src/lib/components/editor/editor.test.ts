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
	computePinchTransform,
	computeTouchPinHitRadiusWorld,
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

	it('computes pinch-to-zoom centered on midpoint without drift', () => {
		const startZoom = 1;
		const startPanX = 50;
		const startPanY = 40;
		const startMidX = 200;
		const startMidY = 160;
		const worldBeforeX = (startMidX - startPanX) / startZoom;
		const worldBeforeY = (startMidY - startPanY) / startZoom;

		const res = computePinchTransform({
			startZoom,
			startMidX,
			startMidY,
			startDist: 100,
			currMidX: startMidX,
			currMidY: startMidY,
			currDist: 180,
			startPanX,
			startPanY,
			minZoom: 0.3,
			maxZoom: 2.5
		});

		expect(res.zoom).toBeCloseTo(1.8, 6);
		// World point under the midpoint remains unchanged
		expect((startMidX - res.panX) / res.zoom).toBeCloseTo(worldBeforeX, 6);
		expect((startMidY - res.panY) / res.zoom).toBeCloseTo(worldBeforeY, 6);
	});

	it('clamps pinch zoom to minZoom and maxZoom cleanly', () => {
		const zoomedOut = computePinchTransform({
			startZoom: 0.8,
			startMidX: 150,
			startMidY: 120,
			startDist: 200,
			currMidX: 150,
			currMidY: 120,
			currDist: 20,
			startPanX: 30,
			startPanY: 20,
			minZoom: 0.3,
			maxZoom: 2.5
		});
		expect(zoomedOut.zoom).toBeCloseTo(0.3, 6);
		expect(Number.isFinite(zoomedOut.panX)).toBe(true);
		expect(Number.isFinite(zoomedOut.panY)).toBe(true);

		const zoomedIn = computePinchTransform({
			startZoom: 1.5,
			startMidX: 150,
			startMidY: 120,
			startDist: 80,
			currMidX: 150,
			currMidY: 120,
			currDist: 400,
			startPanX: 30,
			startPanY: 20,
			minZoom: 0.3,
			maxZoom: 2.5
		});
		expect(zoomedIn.zoom).toBeCloseTo(2.5, 6);
	});

	it('supports simultaneous two-finger midpoint pan with and without scale change', () => {
		const purePan = computePinchTransform({
			startZoom: 1.2,
			startMidX: 100,
			startMidY: 100,
			startDist: 120,
			currMidX: 145,
			currMidY: 70,
			currDist: 120,
			startPanX: 20,
			startPanY: 30,
			minZoom: 0.3,
			maxZoom: 2.5
		});
		expect(purePan.zoom).toBeCloseTo(1.2, 6);
		expect(purePan.panX).toBeCloseTo(65, 6);
		expect(purePan.panY).toBeCloseTo(0, 6);

		const panAndZoom = computePinchTransform({
			startZoom: 1,
			startMidX: 100,
			startMidY: 80,
			startDist: 100,
			currMidX: 130,
			currMidY: 110,
			currDist: 200,
			startPanX: 0,
			startPanY: 0,
			minZoom: 0.3,
			maxZoom: 2.5
		});
		expect(panAndZoom.zoom).toBeCloseTo(2, 6);
		// World (100, 80) maps to new midpoint (130, 110) at zoom 2 => pan = (130 - 200, 110 - 160)
		expect(panAndZoom.panX).toBeCloseTo(-70, 6);
		expect(panAndZoom.panY).toBeCloseTo(-50, 6);
	});

	it('guards against degenerate zero or tiny startDist without NaN or jumps', () => {
		const zeroDist = computePinchTransform({
			startZoom: 1,
			startMidX: 120,
			startMidY: 90,
			startDist: 0,
			currMidX: 135,
			currMidY: 100,
			currDist: 40,
			startPanX: 10,
			startPanY: 20,
			minZoom: 0.3,
			maxZoom: 2.5
		});
		expect(Number.isNaN(zeroDist.zoom)).toBe(false);
		expect(Number.isNaN(zeroDist.panX)).toBe(false);
		expect(Number.isNaN(zeroDist.panY)).toBe(false);
		expect(zeroDist.zoom).toBe(1);
		expect(zeroDist.panX).toBeCloseTo(25, 6);
		expect(zeroDist.panY).toBeCloseTo(30, 6);

		const tinyDist = computePinchTransform({
			startZoom: 1.25,
			startMidX: 100,
			startMidY: 100,
			startDist: 1e-6,
			currMidX: 100,
			currMidY: 100,
			currDist: 50,
			startPanX: 40,
			startPanY: -10,
			minZoom: 0.3,
			maxZoom: 2.5
		});
		expect(tinyDist.zoom).toBeCloseTo(1.25, 6);
		expect(tinyDist.panX).toBeCloseTo(40, 6);
		expect(tinyDist.panY).toBeCloseTo(-10, 6);
	});

	it('computes touch pin hit radius guaranteeing >= 24px screen radius across zoom levels', () => {
		expect(computeTouchPinHitRadiusWorld(0.4)).toBeCloseTo(60, 6);
		expect(computeTouchPinHitRadiusWorld(0.4) * 0.4).toBeGreaterThanOrEqual(24);

		expect(computeTouchPinHitRadiusWorld(1.0)).toBeCloseTo(24, 6);
		expect(computeTouchPinHitRadiusWorld(1.0) * 1.0).toBeGreaterThanOrEqual(24);

		expect(computeTouchPinHitRadiusWorld(2.0)).toBeCloseTo(12, 6);
		expect(computeTouchPinHitRadiusWorld(2.0) * 2.0).toBeGreaterThanOrEqual(24);

		// At high zoom, floor stays at 10 world units
		expect(computeTouchPinHitRadiusWorld(2.5)).toBe(10);
		expect(computeTouchPinHitRadiusWorld(2.5) * 2.5).toBeGreaterThanOrEqual(24);

		// Clamps degenerate low zoom at 0.2
		expect(computeTouchPinHitRadiusWorld(0.05)).toBeCloseTo(120, 6);
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

	it('renders mobile quick element action bar and active placement mode pill cleanly', () => {
		circuit.selectComponent('R1');
		const selectedOut = render(SchematicCanvas);
		expect(selectedOut.body).toContain('Selected element actions');
		expect(selectedOut.body).toContain('Rotate component 90 degrees');
		expect(selectedOut.body).toContain('Open component palette');

		circuit.setActiveTool('resistor');
		const placingOut = render(SchematicCanvas);
		expect(placingOut.body).toContain('Active tool controls');
		expect(placingOut.body).toContain('Rotate 90°');
		expect(placingOut.body).toContain('Done');
	});
});
