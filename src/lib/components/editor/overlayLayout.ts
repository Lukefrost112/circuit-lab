import { GRID_SIZE } from '$lib/components/symbols';
import type { CircuitComponent, CircuitWire, GridPoint } from '$lib/engine';

export interface LayoutRect {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export function rectsOverlap(a: LayoutRect, b: LayoutRect, margin = 3): boolean {
	return !(
		a.x2 + margin <= b.x1 ||
		b.x2 + margin <= a.x1 ||
		a.y2 + margin <= b.y1 ||
		b.y2 + margin <= a.y1
	);
}

function overlapArea(a: LayoutRect, b: LayoutRect, margin = 3): number {
	const ox = Math.min(a.x2 + margin, b.x2) - Math.max(a.x1 - margin, b.x1);
	const oy = Math.min(a.y2 + margin, b.y2) - Math.max(a.y1 - margin, b.y1);
	if (ox <= 0 || oy <= 0) return 0;
	return ox * oy;
}

export function makeCenteredRect(cx: number, cy: number, width: number, height: number): LayoutRect {
	return {
		x1: cx - width / 2,
		y1: cy - height / 2,
		x2: cx + width / 2,
		y2: cy + height / 2
	};
}

export interface ObstacleSet {
	solid: LayoutRect[];
	wires: LayoutRect[];
}

export function buildSchematicObstacles(
	components: CircuitComponent[],
	wires: CircuitWire[],
	getDisplayVal: (comp: CircuitComponent) => string,
	theveninCompId?: string | null
): ObstacleSet {
	const solid: LayoutRect[] = [];
	const wireRects: LayoutRect[] = [];

	for (const comp of components) {
		const cx = comp.x * GRID_SIZE;
		const cy = comp.y * GRID_SIZE;
		const isVertical = comp.rotation === 90 || comp.rotation === 270;

		if (comp.kind === 'ground') {
			solid.push({ x1: cx - 14, y1: cy - 2, x2: cx + 14, y2: cy + 20 });
			const lw = comp.label.length * 6.8 + 6;
			solid.push({ x1: cx + 14, y1: cy + 1, x2: cx + 16 + lw, y2: cy + 15 });
			continue;
		}

		if (comp.kind === 'terminal') {
			solid.push({ x1: cx - 12, y1: cy - 12, x2: cx + 12, y2: cy + 12 });
			const lw = comp.label.length * 6.8 + 8;
			solid.push({ x1: cx - lw / 2, y1: cy - 24, x2: cx + lw / 2, y2: cy - 10 });
			continue;
		}

		if (isVertical) {
			solid.push({ x1: cx - 17, y1: cy - 35, x2: cx + 17, y2: cy + 35 });
			const val = getDisplayVal(comp);
			const lw = Math.max(comp.label.length * 6.8, val.length * 6.2) + 6;
			solid.push({
				x1: cx + 18,
				y1: cy - 14,
				x2: cx + 21 + lw,
				y2: cy + (val ? 15 : 2)
			});
		} else {
			solid.push({ x1: cx - 35, y1: cy - 17, x2: cx + 35, y2: cy + 17 });
			const val = getDisplayVal(comp);
			const halfW = (Math.max(comp.label.length * 6.8, val.length * 6.2) + 8) / 2;
			solid.push({
				x1: cx - halfW,
				y1: cy - 46,
				x2: cx + halfW,
				y2: cy - 17
			});
		}

		if (theveninCompId === comp.id) {
			const topY = cy - (isVertical ? 52 : 54);
			solid.push({ x1: cx - 49, y1: topY - 10, x2: cx + 49, y2: topY + 9 });
		}
	}

	for (const wire of wires) {
		for (let i = 0; i + 1 < wire.points.length; i++) {
			const a = wire.points[i];
			const b = wire.points[i + 1];
			wireRects.push({
				x1: Math.min(a.x, b.x) * GRID_SIZE - 3,
				y1: Math.min(a.y, b.y) * GRID_SIZE - 3,
				x2: Math.max(a.x, b.x) * GRID_SIZE + 3,
				y2: Math.max(a.y, b.y) * GRID_SIZE + 3
			});
		}
	}

	return { solid, wires: wireRects };
}

function scoreRect(
	rect: LayoutRect,
	obstacles: ObstacleSet,
	placedPills: LayoutRect[],
	distPenalty: number
): number {
	let cost = distPenalty;
	for (const obs of obstacles.solid) {
		const area = overlapArea(rect, obs, 4);
		if (area > 0) cost += 10000 + area * 10;
	}
	for (const pill of placedPills) {
		const area = overlapArea(rect, pill, 5);
		if (area > 0) cost += 12000 + area * 10;
	}
	for (const w of obstacles.wires) {
		const area = overlapArea(rect, w, 2);
		if (area > 0) cost += 400 + area * 2;
	}
	return cost;
}

export function chooseBranchPillPosition(
	comp: CircuitComponent,
	pillWidth: number,
	pillHeight: number,
	obstacles: ObstacleSet,
	placedPills: LayoutRect[]
): { x: number; y: number; rect: LayoutRect } {
	const cx = comp.x * GRID_SIZE;
	const cy = comp.y * GRID_SIZE;
	const isVertical = comp.rotation === 90 || comp.rotation === 270;

	const candidates: Array<{ x: number; y: number; bias: number }> = isVertical
		? [
				{ x: cx + 21 + pillWidth / 2, y: cy + 25, bias: 0 },
				{ x: cx - 18 - pillWidth / 2, y: cy, bias: 2 },
				{ x: cx + 21 + pillWidth / 2, y: cy - 24, bias: 4 },
				{ x: cx - 18 - pillWidth / 2, y: cy + 25, bias: 8 },
				{ x: cx - 18 - pillWidth / 2, y: cy - 24, bias: 10 },
				{ x: cx, y: cy + 48, bias: 14 },
				{ x: cx, y: cy - 48, bias: 16 }
			]
		: [
				{ x: cx, y: cy + 25, bias: 0 },
				{ x: cx, y: cy + 38, bias: 4 },
				{ x: cx - 24, y: cy + 25, bias: 6 },
				{ x: cx + 24, y: cy + 25, bias: 6 },
				{ x: cx, y: cy - 58, bias: 10 },
				{ x: cx, y: cy + 52, bias: 14 }
			];

	let best = candidates[0];
	let bestRect = makeCenteredRect(best.x, best.y, pillWidth, pillHeight);
	let bestCost = Infinity;

	for (const cand of candidates) {
		const rect = makeCenteredRect(cand.x, cand.y, pillWidth, pillHeight);
		const cost = scoreRect(rect, obstacles, placedPills, cand.bias);
		if (cost < bestCost) {
			bestCost = cost;
			best = cand;
			bestRect = rect;
		}
	}

	return { x: best.x, y: best.y, rect: bestRect };
}

export function chooseNodePillPosition(
	gridPoints: GridPoint[],
	isReference: boolean,
	pillWidth: number,
	pillHeight: number,
	compCenters: Set<string>,
	obstacles: ObstacleSet,
	placedPills: LayoutRect[]
): { x: number; y: number; anchorX: number; anchorY: number; rect: LayoutRect } {
	const filtered = gridPoints.filter((gp) => !compCenters.has(`${gp.x},${gp.y}`));
	const pool = filtered.length > 0 ? filtered : gridPoints;
	const sortedPool = [...pool].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

	// Add midpoints between adjacent collinear grid points on this node (e.g. wire span between components)
	const seenPts = new Set(sortedPool.map((p) => `${p.x},${p.y}`));
	const candidatePts: Array<{ x: number; y: number }> = [...sortedPool];
	for (let i = 0; i < sortedPool.length; i++) {
		for (let j = i + 1; j < sortedPool.length; j++) {
			const a = sortedPool[i];
			const b = sortedPool[j];
			if ((a.x === b.x || a.y === b.y) && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= 2) {
				const mx = (a.x + b.x) / 2;
				const my = (a.y + b.y) / 2;
				const key = `${mx},${my}`;
				if (!seenPts.has(key) && !compCenters.has(key)) {
					seenPts.add(key);
					candidatePts.push({ x: mx, y: my });
				}
			}
		}
	}

	const offsets: Array<{ dx: number; dy: number; bias: number }> = isReference
		? [
				{ dx: 0, dy: 28, bias: 0 },
				{ dx: pillWidth / 2 + 14, dy: 24, bias: 4 },
				{ dx: -pillWidth / 2 - 14, dy: 24, bias: 6 },
				{ dx: 0, dy: 42, bias: 10 },
				{ dx: 0, dy: -16, bias: 14 },
				{ dx: 0, dy: 56, bias: 18 }
			]
		: [
				{ dx: 0, dy: -17, bias: 0 },
				{ dx: pillWidth / 2 + 8, dy: -16, bias: 3 },
				{ dx: -pillWidth / 2 - 8, dy: -16, bias: 4 },
				{ dx: 0, dy: -31, bias: 6 },
				{ dx: 0, dy: 18, bias: 8 },
				{ dx: pillWidth / 2 + 8, dy: 16, bias: 10 },
				{ dx: -pillWidth / 2 - 8, dy: 16, bias: 11 },
				{ dx: pillWidth / 2 + 12, dy: 0, bias: 13 },
				{ dx: -pillWidth / 2 - 12, dy: 0, bias: 14 },
				{ dx: 0, dy: -46, bias: 16 },
				{ dx: 0, dy: 34, bias: 18 },
				{ dx: 0, dy: -58, bias: 20 },
				{ dx: 0, dy: 48, bias: 22 },
				{ dx: -24, dy: -56, bias: 24 },
				{ dx: 24, dy: -56, bias: 24 },
				{ dx: -24, dy: 48, bias: 26 },
				{ dx: 24, dy: 48, bias: 26 },
				{ dx: 0, dy: -70, bias: 28 },
				{ dx: 0, dy: 62, bias: 30 }
			];

	let bestX = candidatePts[0].x * GRID_SIZE;
	let bestY = candidatePts[0].y * GRID_SIZE + (isReference ? 28 : -17);
	let bestAnchorX = candidatePts[0].x * GRID_SIZE;
	let bestAnchorY = candidatePts[0].y * GRID_SIZE;
	let bestRect = makeCenteredRect(bestX, bestY, pillWidth, pillHeight);
	let bestCost = Infinity;

	candidatePts.forEach((gp, gpIdx) => {
		const px = gp.x * GRID_SIZE;
		const py = gp.y * GRID_SIZE;
		for (const off of offsets) {
			const cx = px + off.dx;
			const cy = py + off.dy;
			const rect = makeCenteredRect(cx, cy, pillWidth, pillHeight);
			const cost = scoreRect(rect, obstacles, placedPills, off.bias + gpIdx * 1.5);
			if (cost < bestCost) {
				bestCost = cost;
				bestX = cx;
				bestY = cy;
				bestAnchorX = px;
				bestAnchorY = py;
				bestRect = rect;
			}
		}
	});

	return { x: bestX, y: bestY, anchorX: bestAnchorX, anchorY: bestAnchorY, rect: bestRect };
}
