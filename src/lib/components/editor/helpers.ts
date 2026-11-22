import {
	Complex,
	formatEngineering,
	formatEngineeringWithSystem,
	formatRational,
	getFixedUnitPrefix,
	getPinPositions,
	parseComplexValue,
	parseEngineeringNumber,
	type AnalysisMode,
	type CircuitComponent,
	type CircuitWire,
	type GridPoint,
	type UnitSystemId
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

export interface WireCrossing {
	/** Grid coordinate of the orthogonal intersection */
	x: number;
	y: number;
	/** true = electrically connected 4-way crossing (solder dot); false = insulated pass-over (bridge hop) */
	connected: boolean;
	/** Wire IDs involved at this crossing */
	wireIds: string[];
}

interface HorizontalSegment {
	wireId: string;
	y: number;
	minX: number;
	maxX: number;
}

interface VerticalSegment {
	wireId: string;
	x: number;
	minY: number;
	maxY: number;
}

/**
 * Detects orthogonal wire crossings across the schematic:
 * - `connected: false` when a horizontal segment and vertical segment cross strictly interior to
 *   both segments with no wire vertex or component pin at the intersection (insulated pass-over).
 * - `connected: true` when a wire vertex (not on a component pin) has incident orthogonal segments
 *   extending in all 4 cardinal directions (left, right, up, down).
 */
export function computeWireCrossings(
	components: CircuitComponent[],
	wires: CircuitWire[]
): WireCrossing[] {
	const pinSet = new Set<string>();
	for (const comp of components) {
		for (const pin of getPinPositions(comp)) {
			pinSet.add(`${pin.x},${pin.y}`);
		}
	}

	const vertexMap = new Map<string, GridPoint>();
	const hSegments: HorizontalSegment[] = [];
	const vSegments: VerticalSegment[] = [];

	for (const wire of wires) {
		for (const pt of wire.points) {
			const key = `${pt.x},${pt.y}`;
			if (!vertexMap.has(key)) {
				vertexMap.set(key, { x: pt.x, y: pt.y });
			}
		}
		for (let i = 0; i + 1 < wire.points.length; i++) {
			const a = wire.points[i];
			const b = wire.points[i + 1];
			if (a.x === b.x && a.y === b.y) continue;
			if (a.y === b.y) {
				hSegments.push({
					wireId: wire.id,
					y: a.y,
					minX: Math.min(a.x, b.x),
					maxX: Math.max(a.x, b.x)
				});
			} else if (a.x === b.x) {
				vSegments.push({
					wireId: wire.id,
					x: a.x,
					minY: Math.min(a.y, b.y),
					maxY: Math.max(a.y, b.y)
				});
			}
		}
	}

	const crossings = new Map<string, { x: number; y: number; connected: boolean; wireIdSet: Set<string> }>();

	// 1. Unconnected orthogonal pass-over crossings
	for (const h of hSegments) {
		for (const v of vSegments) {
			if (v.x > h.minX && v.x < h.maxX && h.y > v.minY && h.y < v.maxY) {
				const key = `${v.x},${h.y}`;
				if (pinSet.has(key) || vertexMap.has(key)) continue;
				let entry = crossings.get(key);
				if (!entry) {
					entry = { x: v.x, y: h.y, connected: false, wireIdSet: new Set<string>() };
					crossings.set(key, entry);
				}
				entry.wireIdSet.add(h.wireId);
				entry.wireIdSet.add(v.wireId);
			}
		}
	}

	// 2. Connected 4-way crossings (preferring connected: true if both somehow matched)
	for (const [key, pt] of vertexMap.entries()) {
		if (pinSet.has(key)) continue;

		let hasLeft = false;
		let hasRight = false;
		let hasUp = false;
		let hasDown = false;
		const incidentWireIds = new Set<string>();

		for (const h of hSegments) {
			if (h.y !== pt.y) continue;
			if (pt.x > h.minX && pt.x < h.maxX) {
				hasLeft = true;
				hasRight = true;
				incidentWireIds.add(h.wireId);
			} else if (h.maxX === pt.x && h.minX < pt.x) {
				hasLeft = true;
				incidentWireIds.add(h.wireId);
			} else if (h.minX === pt.x && h.maxX > pt.x) {
				hasRight = true;
				incidentWireIds.add(h.wireId);
			}
		}

		for (const v of vSegments) {
			if (v.x !== pt.x) continue;
			if (pt.y > v.minY && pt.y < v.maxY) {
				hasUp = true;
				hasDown = true;
				incidentWireIds.add(v.wireId);
			} else if (v.maxY === pt.y && v.minY < pt.y) {
				hasUp = true;
				incidentWireIds.add(v.wireId);
			} else if (v.minY === pt.y && v.maxY > pt.y) {
				hasDown = true;
				incidentWireIds.add(v.wireId);
			}
		}

		if (hasLeft && hasRight && hasUp && hasDown) {
			const existing = crossings.get(key);
			if (existing) {
				existing.connected = true;
				for (const wid of incidentWireIds) {
					existing.wireIdSet.add(wid);
				}
			} else {
				crossings.set(key, {
					x: pt.x,
					y: pt.y,
					connected: true,
					wireIdSet: incidentWireIds
				});
			}
		}
	}

	return Array.from(crossings.values())
		.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))
		.map((c) => ({
			x: c.x,
			y: c.y,
			connected: c.connected,
			wireIds: Array.from(c.wireIdSet)
		}));
}

/**
 * Builds an SVG `<path d="...">` string for a wire polyline in pixel coordinates,
 * inserting semicircular upward IEEE bridge-hop arcs along horizontal segments wherever
 * they cross strictly over an unconnected crossing in `unconnectedCrossings`.
 */
export function buildWirePathWithBridges(
	points: GridPoint[],
	unconnectedCrossings: ReadonlySet<string>,
	gridSize: number,
	arcRadiusPx = 6.5
): string {
	if (points.length === 0) return '';
	const parts: string[] = [`M ${points[0].x * gridSize} ${points[0].y * gridSize}`];
	if (points.length === 1) return parts[0];

	const r = Math.max(0.5, Math.min(arcRadiusPx, gridSize * 0.45));

	for (let i = 0; i + 1 < points.length; i++) {
		const a = points[i];
		const b = points[i + 1];

		if (unconnectedCrossings.size > 0 && a.y === b.y && a.x !== b.x) {
			const goingRight = b.x > a.x;
			const minX = Math.min(a.x, b.x);
			const maxX = Math.max(a.x, b.x);
			const yPx = a.y * gridSize;
			const sweep = goingRight ? 1 : 0;

			const crossingXs: number[] = [];
			const startInt = Math.floor(minX) + 1;
			const endInt = Math.ceil(maxX) - 1;
			for (let cx = startInt; cx <= endInt; cx++) {
				if (cx > minX && cx < maxX && unconnectedCrossings.has(`${cx},${a.y}`)) {
					crossingXs.push(cx);
				}
			}

			if (!goingRight) {
				crossingXs.reverse();
			}

			for (const cx of crossingXs) {
				const crossX = cx * gridSize;
				const startX = goingRight ? crossX - r : crossX + r;
				const endX = goingRight ? crossX + r : crossX - r;
				parts.push(`L ${startX} ${yPx}`);
				parts.push(`A ${r} ${r} 0 0 ${sweep} ${endX} ${yPx}`);
			}

			parts.push(`L ${b.x * gridSize} ${yPx}`);
		} else {
			parts.push(`L ${b.x * gridSize} ${b.y * gridSize}`);
		}
	}

	return parts.join(' ');
}

/**
 * Builds the standalone semicircular upward bridge-hop arc `<path d="...">` centered at grid `(x, y)`
 * for rendering a crisp background halo mask and foreground pass-over arch regardless of wire z-order.
 */
export function buildBridgeArcPath(
	x: number,
	y: number,
	gridSize: number,
	arcRadiusPx = 6.5
): string {
	const cx = x * gridSize;
	const cy = y * gridSize;
	const r = Math.max(0.5, Math.min(arcRadiusPx, gridSize * 0.45));
	return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
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

function formatScaledScalar(n: number, prec: number): string {
	const cleaned = Math.abs(n) < 1e-12 ? 0 : n;
	if (cleaned === 0) return '0';
	const rounded = Number(cleaned.toPrecision(prec));
	const abs = Math.abs(rounded);
	if (abs >= 1e-4 && abs < 1e6) {
		return rounded.toString();
	}
	return rounded.toExponential().replace(/e\+?/, 'e');
}

export function formatComponentDisplayValue(
	comp: CircuitComponent,
	mode: AnalysisMode,
	unitSystem: UnitSystemId = 'auto'
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
			return formatEngineeringWithSystem(num, unit, 3, unitSystem);
		}
		return unit ? `${comp.value} ${unit}` : comp.value;
	}

	const raw = comp.value.trim();
	const parsed = parseComplexValue(raw);
	if (!parsed) {
		return unit ? `${comp.value} ${unit}` : comp.value;
	}

	if (mode === 'dc') {
		return formatEngineeringWithSystem(parsed.re, unit, 3, unitSystem);
	}

	const hasExplicitAngleOrJ = /[∠@j]/i.test(raw);
	const effective =
		!hasExplicitAngleOrJ && comp.phaseDeg !== undefined && Number.isFinite(comp.phaseDeg)
			? Complex.fromPolar(parsed.re, comp.phaseDeg)
			: parsed;

	if (effective.isReal(1e-12) && effective.re >= 0 && !hasExplicitAngleOrJ && comp.phaseDeg === undefined) {
		return formatEngineeringWithSystem(effective.re, unit, 3, unitSystem);
	}

	const fixed = getFixedUnitPrefix(unit, unitSystem);
	const mag = effective.abs();
	if (mag < 1e-12) {
		const zeroUnit = fixed ? `${fixed.symbol}${unit}` : unit;
		return zeroUnit ? `0 ${zeroUnit}` : '0';
	}
	const deg = Math.abs(effective.argDeg()) < 1e-9 ? 0 : effective.argDeg();
	const degStr = Number(deg.toPrecision(3)).toString();
	if (fixed) {
		const magStr = formatScaledScalar(mag / fixed.factor, 3);
		const unitWithPrefix = `${fixed.symbol}${unit}`;
		return unitWithPrefix ? `${magStr}∠${degStr}° ${unitWithPrefix}` : `${magStr}∠${degStr}°`;
	}
	const magStr = formatEngineering(mag, '', 3);
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
		unitSystem?: UnitSystemId;
	}
): string {
	const unitSystem = opts.unitSystem ?? 'auto';
	const fixed = getFixedUnitPrefix(unit, unitSystem);
	const unitWithPrefix = fixed ? `${fixed.symbol}${unit}` : unit;

	if (mode === 'dc') {
		const real = Math.abs(value.re) < 1e-12 ? 0 : value.re;
		if (real === 0) return `0 ${unitWithPrefix}`;

		if (opts.showDcFractions) {
			const targetVal = fixed ? real / fixed.factor : real;
			if (Math.abs(targetVal) >= 0.01 && Math.abs(targetVal) <= 1000) {
				const rat = formatRational(targetVal, 100);
				if (rat && rat.includes('/')) {
					return `${rat} ${unitWithPrefix}`;
				}
			}
		}
		return formatEngineeringWithSystem(real, unit, opts.precision, unitSystem);
	}

	const mag = value.abs();
	if (mag < 1e-12) return `0 ${unitWithPrefix}`;

	if (opts.angleDisplay === 'rectangular') {
		const scaled = fixed ? value.scale(1 / fixed.factor) : value;
		return `${scaled.formatRect(opts.precision)} ${unitWithPrefix}`;
	}

	const deg = Math.abs(value.argDeg()) < 1e-9 ? 0 : value.argDeg();
	const degStr = Number(deg.toPrecision(opts.precision)).toString();
	if (fixed) {
		const magStr = formatScaledScalar(mag / fixed.factor, opts.precision);
		return `${magStr}∠${degStr}° ${unitWithPrefix}`;
	}
	const magStr = formatEngineering(mag, '', opts.precision);
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
