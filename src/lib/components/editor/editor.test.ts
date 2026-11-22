import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { PRESETS } from '$lib/data/presets';
import { Complex } from '$lib/engine';
import { circuit } from '$lib/stores/circuit.svelte';
import { settings } from '$lib/stores/settings.svelte';
import {
	AC_FREQUENCY_PRESETS,
	ComponentPalette,
	EngineeringInput,
	MOUSE_DRAG_THRESHOLD_PX,
	PropertyInspector,
	SchematicCanvas,
	TOUCH_DRAG_THRESHOLD_PX,
	TOUCH_WIRE_DRAG_THRESHOLD_PX,
	computeJunctionPoints,
	computeManhattanPoints,
	computePinchTransform,
	computeTouchPinHitRadiusWorld,
	formatComplexOverlay,
	formatComponentDisplayValue,
	getDragThresholdPx,
	hasExceededDragThreshold,
	isPointInComponentBodyHitbox,
	isTouchLikePointer
} from './index';
import {
	buildSchematicObstacles,
	chooseBranchPillPosition,
	rectsOverlap,
	type LayoutRect
} from './overlayLayout';

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

		// Defined unit systems on component labels & overlays
		expect(formatComponentDisplayValue(r1, 'dc', 'ohm-v-a')).toBe('2000 Ω');
		expect(formatComponentDisplayValue(r1, 'dc', 'kohm-v-ma')).toBe('2 kΩ');
		expect(formatComponentDisplayValue(r1, 'dc', 'mohm-v-ua')).toBe('0.002 MΩ');

		expect(
			formatComplexOverlay(Complex.from(2 / 3000, 0), 'A', 'dc', {
				precision: 3,
				angleDisplay: 'polar',
				showDcFractions: true,
				unitSystem: 'kohm-v-ma'
			})
		).toBe('2/3 mA');

		expect(
			formatComplexOverlay(Complex.from(0.004, 0), 'A', 'dc', {
				precision: 3,
				angleDisplay: 'polar',
				showDcFractions: true,
				unitSystem: 'ohm-v-a'
			})
		).toBe('0.004 A');

		expect(
			formatComplexOverlay(Complex.fromPolar(0.015, 45), 'A', 'ac', {
				precision: 3,
				angleDisplay: 'polar',
				showDcFractions: true,
				unitSystem: 'kohm-v-ma'
			})
		).toBe('15∠45° mA');
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

	it('exposes standard lab AC frequency presets in ascending order', () => {
		expect(AC_FREQUENCY_PRESETS.map((p) => p.label)).toEqual([
			'50 Hz',
			'60 Hz',
			'1 kHz',
			'10 kHz'
		]);
		expect(AC_FREQUENCY_PRESETS.map((p) => p.hz)).toEqual([50, 60, 1000, 10000]);
	});

	it('classifies touch-like pointers and evaluates drag/wire movement thresholds accurately', () => {
		expect(isTouchLikePointer('touch')).toBe(true);
		expect(isTouchLikePointer('pen')).toBe(true);
		expect(isTouchLikePointer('mouse')).toBe(false);

		expect(getDragThresholdPx('touch')).toBe(TOUCH_DRAG_THRESHOLD_PX);
		expect(getDragThresholdPx('pen')).toBe(TOUCH_DRAG_THRESHOLD_PX);
		expect(getDragThresholdPx('mouse')).toBe(MOUSE_DRAG_THRESHOLD_PX);

		// Sub-threshold jitter must not trigger drag
		expect(hasExceededDragThreshold(100, 100, 104, 104, TOUCH_DRAG_THRESHOLD_PX)).toBe(false);
		expect(hasExceededDragThreshold(100, 100, 107, 100, TOUCH_DRAG_THRESHOLD_PX)).toBe(true);

		// Wire press-drag-release threshold separates tap-tap from press-drag-release
		expect(hasExceededDragThreshold(50, 50, 59, 59, TOUCH_WIRE_DRAG_THRESHOLD_PX)).toBe(false);
		expect(hasExceededDragThreshold(50, 50, 65, 50, TOUCH_WIRE_DRAG_THRESHOLD_PX)).toBe(true);
	});

	it('distinguishes component body hitboxes from open pan space beside pins', () => {
		const horizResistor = { kind: 'resistor' as const, x: 10, y: 6, rotation: 0 as const };
		// Inside 34x18px (1.7x0.9 grid) half-extents
		expect(isPointInComponentBodyHitbox(horizResistor, 10, 6)).toBe(true);
		expect(isPointInComponentBodyHitbox(horizResistor, 11.7, 6.9)).toBe(true);
		// Pin itself (x=12) and ~10px beside pin (x=12.5) are outside body hitbox
		expect(isPointInComponentBodyHitbox(horizResistor, 12.0, 6)).toBe(false);
		expect(isPointInComponentBodyHitbox(horizResistor, 12.5, 6)).toBe(false);
		expect(isPointInComponentBodyHitbox(horizResistor, 10, 7.1)).toBe(false);

		const vertResistor = { kind: 'resistor' as const, x: 10, y: 6, rotation: 90 as const };
		expect(isPointInComponentBodyHitbox(vertResistor, 10.9, 7.7)).toBe(true);
		expect(isPointInComponentBodyHitbox(vertResistor, 11.1, 6)).toBe(false);
		expect(isPointInComponentBodyHitbox(vertResistor, 10, 8.0)).toBe(false);

		const gnd = { kind: 'ground' as const, x: 4, y: 10, rotation: 0 as const };
		expect(isPointInComponentBodyHitbox(gnd, 4.9, 10.9)).toBe(true);
		expect(isPointInComponentBodyHitbox(gnd, 5.1, 10)).toBe(false);
		expect(isPointInComponentBodyHitbox(gnd, 4, 11.1)).toBe(false);

		const term = { kind: 'terminal' as const, x: 18, y: 4, rotation: 90 as const };
		expect(isPointInComponentBodyHitbox(term, 18.8, 4.8)).toBe(true);
		expect(isPointInComponentBodyHitbox(term, 18, 5.2)).toBe(false);
	});

	it('places branch current pills clear of horizontal wires passing over vertical top pins', () => {
		const verticalBranch = {
			id: 'R2',
			kind: 'resistor' as const,
			label: 'R2',
			x: 12,
			y: 8,
			rotation: 90 as const,
			value: '6k'
		};
		const wires = [
			// Horizontal wire passing directly over the vertical branch top pin (12, 6)
			{ id: 'w-top', points: [{ x: 4, y: 6 }, { x: 18, y: 6 }] },
			// Horizontal bottom rail passing over the bottom pin (12, 10)
			{ id: 'w-bot', points: [{ x: 4, y: 10 }, { x: 18, y: 10 }] }
		];

		const obstacles = buildSchematicObstacles(
			[verticalBranch],
			wires,
			(c) => formatComponentDisplayValue(c, 'dc')
		);
		const chosen = chooseBranchPillPosition(verticalBranch, 48, 16, obstacles, []);

		// Must not overlap any wire segment (including y=6 top pin wire) or component/label solid
		for (const wireRect of obstacles.wires) {
			expect(rectsOverlap(chosen.rect, wireRect, 2)).toBe(false);
		}
		for (const solidRect of obstacles.solid) {
			expect(rectsOverlap(chosen.rect, solidRect, 2)).toBe(false);
		}

		// Even when preferred bottom-right is occupied by another pill, it still avoids the y=6 wire
		const blockedRight = chooseBranchPillPosition(verticalBranch, 48, 16, obstacles, [
			chosen.rect
		]);
		for (const wireRect of obstacles.wires) {
			expect(rectsOverlap(blockedRight.rect, wireRect, 2)).toBe(false);
		}
		for (const solidRect of obstacles.solid) {
			expect(rectsOverlap(blockedRight.rect, solidRect, 2)).toBe(false);
		}
	});

	it('places all branch current pills cleanly without overlapping wires or component solids across presets', () => {
		for (const preset of PRESETS) {
			const doc = preset.document;
			const obstacles = buildSchematicObstacles(
				doc.components,
				doc.wires,
				(c) => formatComponentDisplayValue(c, doc.mode),
				preset.theveninLoadId ?? null
			);
			const placed: LayoutRect[] = [];
			for (const comp of doc.components) {
				if (comp.kind === 'ground' || comp.kind === 'terminal') continue;
				const chosen = chooseBranchPillPosition(comp, 48, 16, obstacles, placed);
				placed.push(chosen.rect);
				for (const wireRect of obstacles.wires) {
					expect(
						rectsOverlap(chosen.rect, wireRect, 2),
						`${preset.id} ${comp.id} pill overlaps wire`
					).toBe(false);
				}
				for (const solidRect of obstacles.solid) {
					expect(
						rectsOverlap(chosen.rect, solidRect, 2),
						`${preset.id} ${comp.id} pill overlaps solid`
					).toBe(false);
				}
			}
		}
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

		// Clearing canvas immediately suppresses the onboarding overlay so drafting is unblocked
		circuit.clearCircuit();
		expect(circuit.emptyBannerDismissed).toBe(true);
		const clearedOut = render(SchematicCanvas);
		expect(clearedOut.body).not.toContain('Place a component or load a preset to begin');

		// When empty and not dismissed in select mode, onboarding prompt renders with dismiss control
		circuit.resetEmptyBanner();
		const emptyOut = render(SchematicCanvas);
		expect(emptyOut.body).toContain('Place a component or load a preset to begin');
		expect(emptyOut.body).toContain('aria-label="Dismiss empty canvas prompt"');

		// Arming any placement/wire tool immediately hides the empty banner so it never blocks drafting
		circuit.setActiveTool('resistor');
		const armedEmptyOut = render(SchematicCanvas);
		expect(armedEmptyOut.body).not.toContain('Place a component or load a preset to begin');
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

		// 1-tap mobile Wire tool toggle reflects active state cleanly
		expect(placingOut.body).toContain('aria-label="Wire tool"');
		expect(placingOut.body).toContain('aria-pressed="false"');

		circuit.setActiveTool('wire');
		const wiringOut = render(SchematicCanvas);
		expect(wiringOut.body).toContain('aria-label="Wire tool"');
		expect(wiringOut.body).toContain('aria-pressed="true"');
		expect(wiringOut.body).toContain('Orthogonal Wire');
		// Expanded 24px touch pin hit circle is active in wire and probe modes
		expect(wiringOut.body).toContain('r="24" fill="transparent"');

		circuit.setActiveTool('probe');
		const probeOut = render(SchematicCanvas);
		expect(probeOut.body).toContain('r="24" fill="transparent"');

		// Tight 8px pin hit circle in select mode so open space beside pins pans cleanly
		circuit.setActiveTool('select');
		const selectOut = render(SchematicCanvas);
		expect(selectOut.body).toContain('r="8" fill="transparent"');
		expect(selectOut.body).not.toContain('r="24" fill="transparent"');
	});

	it('renders desktop Auto-Wire feedback in place of secondary telemetry without losing solver status', () => {
		const idleOut = render(SchematicCanvas);
		expect(idleOut.body).toContain('Grid 20px');
		expect(idleOut.body).toContain('Nodes');
		expect(idleOut.body).toContain('All methods verified');

		const feedbackOut = render(SchematicCanvas, {
			props: { autoWireFeedback: 'Auto-wired (+5 wires)' }
		});
		expect(feedbackOut.body).toContain('All methods verified');
		expect(feedbackOut.body).toContain('Auto-wired (+5 wires)');
		expect(feedbackOut.body).not.toContain('Grid 20px');
	});
});
