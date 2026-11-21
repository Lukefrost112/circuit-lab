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
