import {
	Complex,
	formatEngineering,
	formatRational,
	getPinPositions,
	parseComplexValue,
	parseEngineeringNumber,
	type AnalysisMode,
	type CircuitComponent,
	type CircuitWire,
	type GridPoint
} from '$lib/engine';
import type { AngleDisplay, DisplayPrecision } from '$lib/stores/settings.svelte';

export type WireBendMode = 'hv' | 'vh';

export function computeManhattanPoints(
	start: GridPoint,
	end: GridPoint,
	bend: WireBendMode
): GridPoint[] {
	if (start.x === end.x && start.y === end.y) {
		return [{ x: start.x, y: start.y }];
	}
	if (start.x === end.x || start.y === end.y) {
		return [
			{ x: start.x, y: start.y },
			{ x: end.x, y: end.y }
		];
	}
	const corner: GridPoint =
		bend === 'hv' ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
	return [{ x: start.x, y: start.y }, corner, { x: end.x, y: end.y }];
}

function isStrictInteriorPoint(p: GridPoint, a: GridPoint, b: GridPoint): boolean {
	if (a.x === b.x && a.y === b.y) return false;
	if (p.x === a.x && p.y === a.y) return false;
	if (p.x === b.x && p.y === b.y) return false;
	const minX = Math.min(a.x, b.x);
	const maxX = Math.max(a.x, b.x);
	const minY = Math.min(a.y, b.y);
	const maxY = Math.max(a.y, b.y);
	if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;
	const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
	return Math.abs(cross) < 1e-6;
}

/**
 * Returns every grid coordinate where 3 or more wire segments / component pins meet.
 */
export function computeJunctionPoints(
	components: CircuitComponent[],
	wires: CircuitWire[]
): GridPoint[] {
	const candidates = new Map<string, GridPoint>();
	const addCandidate = (pt: GridPoint) => {
		const key = `${pt.x},${pt.y}`;
		if (!candidates.has(key)) {
			candidates.set(key, { x: pt.x, y: pt.y });
		}
	};

	const pins: GridPoint[] = [];
	for (const comp of components) {
		for (const pin of getPinPositions(comp)) {
			const pt = { x: pin.x, y: pin.y };
			pins.push(pt);
			addCandidate(pt);
		}
	}

	const segments: Array<[GridPoint, GridPoint]> = [];
	for (const wire of wires) {
		for (const pt of wire.points) {
			addCandidate(pt);
		}
		for (let i = 0; i + 1 < wire.points.length; i++) {
			const a = wire.points[i];
			const b = wire.points[i + 1];
			if (a.x !== b.x || a.y !== b.y) {
				segments.push([a, b]);
			}
		}
	}

	const junctions: GridPoint[] = [];
	for (const pt of candidates.values()) {
		let count = 0;
		for (const pin of pins) {
			if (pin.x === pt.x && pin.y === pt.y) {
				count += 1;
			}
		}
		for (const [a, b] of segments) {
			if ((a.x === pt.x && a.y === pt.y) || (b.x === pt.x && b.y === pt.y)) {
				count += 1;
			} else if (isStrictInteriorPoint(pt, a, b)) {
				count += 2;
			}
		}
		if (count >= 3) {
			junctions.push(pt);
		}
	}

	return junctions;
}

export function isPointNearSegment(
	px: number,
	py: number,
	a: GridPoint,
	b: GridPoint,
	tolerance = 0.25
): boolean {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) {
		return Math.hypot(px - a.x, py - a.y) <= tolerance;
	}
	const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
	const projX = a.x + t * dx;
	const projY = a.y + t * dy;
	return Math.hypot(px - projX, py - projY) <= tolerance;
}

export function formatComponentDisplayValue(
	comp: CircuitComponent,
	mode: AnalysisMode
): string {
	if (comp.kind === 'ground') return '';
	if (comp.kind === 'terminal') return '';

	const unitMap: Record<string, string> = {
		resistor: 'Ω',
		capacitor: 'F',
		inductor: 'H',
		voltage_source: 'V',
		current_source: 'A'
	};
	const unit = comp.unit ?? unitMap[comp.kind] ?? '';

	if (comp.kind === 'resistor' || comp.kind === 'capacitor' || comp.kind === 'inductor') {
		const num = parseEngineeringNumber(comp.value);
		if (num !== null && num > 0) {
			return formatEngineering(num, unit, 3);
		}
		return unit ? `${comp.value} ${unit}` : comp.value;
	}

	const raw = comp.value.trim();
	const parsed = parseComplexValue(raw);
	if (!parsed) {
		return unit ? `${comp.value} ${unit}` : comp.value;
	}

	if (mode === 'dc') {
		return formatEngineering(parsed.re, unit, 3);
	}

	const hasExplicitAngleOrJ = /[∠@j]/i.test(raw);
	const effective =
		!hasExplicitAngleOrJ && comp.phaseDeg !== undefined && Number.isFinite(comp.phaseDeg)
			? Complex.fromPolar(parsed.re, comp.phaseDeg)
			: parsed;

	if (effective.isReal(1e-12) && effective.re >= 0 && !hasExplicitAngleOrJ && comp.phaseDeg === undefined) {
		return formatEngineering(effective.re, unit, 3);
	}

	const mag = effective.abs();
	if (mag < 1e-12) {
		return unit ? `0 ${unit}` : '0';
	}
	const magStr = formatEngineering(mag, '', 3);
	const deg = Math.abs(effective.argDeg()) < 1e-9 ? 0 : effective.argDeg();
	const degStr = Number(deg.toPrecision(3)).toString();
	return unit ? `${magStr}∠${degStr}° ${unit}` : `${magStr}∠${degStr}°`;
}

export function formatComplexOverlay(
	value: Complex,
	unit: string,
	mode: AnalysisMode,
	opts: {
		precision: DisplayPrecision;
		angleDisplay: AngleDisplay;
		showDcFractions: boolean;
	}
): string {
	if (mode === 'dc') {
		const real = Math.abs(value.re) < 1e-12 ? 0 : value.re;
		if (real === 0) return `0 ${unit}`;

		if (opts.showDcFractions && Math.abs(real) >= 0.01 && Math.abs(real) <= 1000) {
			const rat = formatRational(real, 100);
			if (rat && rat.includes('/')) {
				return `${rat} ${unit}`;
			}
		}
		return formatEngineering(real, unit, opts.precision);
	}

	const mag = value.abs();
	if (mag < 1e-12) return `0 ${unit}`;

	if (opts.angleDisplay === 'rectangular') {
		return `${value.formatRect(opts.precision)} ${unit}`;
	}

	const magStr = formatEngineering(mag, '', opts.precision);
	const deg = Math.abs(value.argDeg()) < 1e-9 ? 0 : value.argDeg();
	const degStr = Number(deg.toPrecision(opts.precision)).toString();
	return `${magStr}∠${degStr}° ${unit}`;
}

export interface PinchTransformInput {
	startZoom: number;
	startMidX: number;
	startMidY: number;
	startDist: number;
	currMidX: number;
	currMidY: number;
	currDist: number;
	startPanX: number;
	startPanY: number;
	minZoom?: number;
	maxZoom?: number;
}

export interface PinchTransformResult {
	zoom: number;
	panX: number;
	panY: number;
}

/**
 * Computes the next canvas zoom and pan for a two-finger pinch gesture so that
 * scaling smoothly centers between the two fingers while simultaneously tracking
 * midpoint translation (two-finger pan). Guards against tiny/zero distances.
 */
export function computePinchTransform({
	startZoom,
	startMidX,
	startMidY,
	startDist,
	currMidX,
	currMidY,
	currDist,
	startPanX,
	startPanY,
	minZoom = 0.3,
	maxZoom = 2.5
}: PinchTransformInput): PinchTransformResult {
	const safeStartZoom = Number.isFinite(startZoom) && startZoom > 0 ? startZoom : 1;
	const safeMinZoom = Number.isFinite(minZoom) && minZoom > 0 ? minZoom : 0.3;
	const safeMaxZoom =
		Number.isFinite(maxZoom) && maxZoom >= safeMinZoom ? maxZoom : Math.max(2.5, safeMinZoom);

	const scale =
		Number.isFinite(startDist) && startDist > 1e-3 && Number.isFinite(currDist) && currDist > 0
			? currDist / startDist
			: 1;

	const zoom = Math.min(safeMaxZoom, Math.max(safeMinZoom, safeStartZoom * scale));

	const worldMidX = (startMidX - startPanX) / safeStartZoom;
	const worldMidY = (startMidY - startPanY) / safeStartZoom;

	return {
		zoom,
		panX: currMidX - worldMidX * zoom,
		panY: currMidY - worldMidY * zoom
	};
}

/**
 * Returns an SVG world-space hit radius for component pins that guarantees at least
 * `minScreenRadiusPx` (default 24px radius = 48px diameter) in screen space at any zoom level.
 */
export function computeTouchPinHitRadiusWorld(zoom: number, minScreenRadiusPx = 24): number {
	const safeZoom = Number.isFinite(zoom) ? Math.max(0.2, zoom) : 1;
	return Math.max(10, minScreenRadiusPx / safeZoom);
}

export interface FrequencyPreset {
	label: string;
	hz: number;
}

/** Standard electrical engineering lab AC drive frequencies for quick mobile selection. */
export const AC_FREQUENCY_PRESETS: readonly FrequencyPreset[] = [
	{ label: '50 Hz', hz: 50 },
	{ label: '60 Hz', hz: 60 },
	{ label: '1 kHz', hz: 1000 },
	{ label: '10 kHz', hz: 10000 }
] as const;

export const TOUCH_DRAG_THRESHOLD_PX = 6;
export const MOUSE_DRAG_THRESHOLD_PX = 3;
export const TOUCH_WIRE_DRAG_THRESHOLD_PX = 14;

export function isTouchLikePointer(pointerType: string): boolean {
	return pointerType === 'touch' || pointerType === 'pen';
}

export function getDragThresholdPx(pointerType: string): number {
	return isTouchLikePointer(pointerType) ? TOUCH_DRAG_THRESHOLD_PX : MOUSE_DRAG_THRESHOLD_PX;
}

export function hasExceededDragThreshold(
	startX: number,
	startY: number,
	currX: number,
	currY: number,
	thresholdPx: number
): boolean {
	return Math.hypot(currX - startX, currY - startY) > thresholdPx;
}

/**
 * Checks whether a grid-space point `(gx, gy)` falls inside the component's body hitbox
 * (`34×18`px horizontal / `18×34`px vertical half-extents for 2-pin parts; `18×18`px for 1-pin
 * ground/terminal parts, at `GRID_SIZE = 20`).
 */
export function isPointInComponentBodyHitbox(
	comp: Pick<CircuitComponent, 'kind' | 'x' | 'y' | 'rotation'>,
	gx: number,
	gy: number
): boolean {
	const isOnePinComp = comp.kind === 'ground' || comp.kind === 'terminal';
	const isVertical = comp.rotation === 90 || comp.rotation === 270;
	const halfW = isOnePinComp ? 0.9 : isVertical ? 0.9 : 1.7;
	const halfH = isOnePinComp ? 0.9 : isVertical ? 1.7 : 0.9;
	return Math.abs(gx - comp.x) <= halfW + 1e-9 && Math.abs(gy - comp.y) <= halfH + 1e-9;
}
