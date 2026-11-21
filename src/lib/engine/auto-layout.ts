/**
 * Deterministic Orthogonal Auto-Layout Engine for Circuit Lab.
 *
 * Converts a compact node-based netlist (AI import or programmatic AINetlistDocument)
 * into a clean, non-overlapping, Manhattan-routed `CircuitDocument` whose
 * `buildElectricalGraph()` topology is 100% faithful to the input netlist.
 */

import type {
	AcMagnitudeMode,
	AnalysisMode,
	CircuitComponent,
	CircuitDocument,
	CircuitWire,
	ComponentKind,
	DependentControlRef,
	GridPoint,
	Rotation
} from './types';

export interface LayoutNetlistElement {
	id?: string;
	kind: ComponentKind;
	label?: string;
	from?: string;
	to?: string;
	nodes?: string[];
	value: string;
	phaseDeg?: number;
	frequencyHz?: number;
	sourceMode?: AnalysisMode;
	terminalName?: string;
	controlRef?: DependentControlRef;
}

export interface LayoutNetlistDocument {
	schemaVersion?: 1;
	id?: string;
	name?: string;
	mode?: AnalysisMode;
	frequencyHz?: number;
	acMagnitudeMode?: AcMagnitudeMode;
	groundNode?: string;
	elements: LayoutNetlistElement[];
}

const GROUND_ALIASES = new Set(['0', 'gnd', 'ground', 'ref', 'reference']);

const KIND_PREFIX: Record<ComponentKind, string> = {
	resistor: 'R',
	capacitor: 'C',
	inductor: 'L',
	voltage_source: 'V',
	current_source: 'I',
	ground: 'GND',
	terminal: 'T'
};

interface NormalizedElement {
	id: string;
	kind: ComponentKind;
	label: string;
	from: string;
	to: string;
	value: string;
	phaseDeg?: number;
	terminalName?: string;
	controlRef?: DependentControlRef;
}

interface HorizontalPlacement {
	el: NormalizedElement;
	colLeft: number;
	colRight: number;
	row: number;
	y: number;
	cx: number;
	rotation: Rotation;
}

function isGroundAlias(name: string, explicitGroundNames: Set<string>): boolean {
	const trimmed = name.trim();
	if (explicitGroundNames.has(trimmed)) return true;
	return GROUND_ALIASES.has(trimmed.toLowerCase());
}

function resolveElementEndpoints(el: LayoutNetlistElement): { from: string; to: string } {
	if (el.kind === 'ground' || el.kind === 'terminal') {
		const single = el.from ?? el.nodes?.[0] ?? el.to ?? '0';
		return { from: single.trim(), to: single.trim() };
	}
	const from = (el.from ?? el.nodes?.[0] ?? '').trim();
	const to = (el.to ?? el.nodes?.[1] ?? '').trim();
	return { from, to };
}

function inferMode(netlist: LayoutNetlistDocument): AnalysisMode {
	if (netlist.mode === 'dc' || netlist.mode === 'ac') {
		return netlist.mode;
	}
	for (const el of netlist.elements) {
		if (el.sourceMode === 'ac' || el.phaseDeg !== undefined) return 'ac';
		if (typeof el.value === 'string' && /[∠@j]/i.test(el.value)) return 'ac';
	}
	return 'dc';
}

function inferFrequencyHz(netlist: LayoutNetlistDocument): number {
	if (typeof netlist.frequencyHz === 'number' && Number.isFinite(netlist.frequencyHz) && netlist.frequencyHz > 0) {
		return netlist.frequencyHz;
	}
	for (const el of netlist.elements) {
		if (typeof el.frequencyHz === 'number' && Number.isFinite(el.frequencyHz) && el.frequencyHz > 0) {
			return el.frequencyHz;
		}
	}
	return 60;
}

function makeWire(id: string, pts: Array<[number, number]>): CircuitWire {
	return {
		id,
		points: pts.map(([x, y]): GridPoint => ({ x, y }))
	};
}

/**
 * Computes a deterministic, non-overlapping orthogonal schematic layout for a node-based netlist.
 */
export function layoutNetlistToDocument(netlist: LayoutNetlistDocument): CircuitDocument {
	const mode = inferMode(netlist);
	const frequencyHz = inferFrequencyHz(netlist);
	const acMagnitudeMode: AcMagnitudeMode | undefined =
		netlist.acMagnitudeMode ?? (mode === 'ac' ? 'rms' : undefined);

	// 1. Identify canonical ground node name(s)
	const explicitGroundNames = new Set<string>();
	if (netlist.groundNode && netlist.groundNode.trim() !== '') {
		explicitGroundNames.add(netlist.groundNode.trim());
	}
	for (const el of netlist.elements) {
		if (el.kind === 'ground') {
			const { from } = resolveElementEndpoints(el);
			if (from) explicitGroundNames.add(from);
		}
	}

	const rawNormalize = (name: string): string =>
		isGroundAlias(name, explicitGroundNames) ? '0' : name.trim();

	// If no explicit ground alias exists, pick reference node deterministically
	// (matching graph.ts: first voltage_source negative terminal, else highest-degree node)
	let fallbackRefNode: string | null = null;
	let hasAnyGround = false;
	for (const el of netlist.elements) {
		const { from, to } = resolveElementEndpoints(el);
		if (rawNormalize(from) === '0' || rawNormalize(to) === '0') {
			hasAnyGround = true;
			break;
		}
	}

	if (!hasAnyGround && netlist.elements.length > 0) {
		const firstVSource = netlist.elements.find((e) => e.kind === 'voltage_source');
		if (firstVSource) {
			const { to } = resolveElementEndpoints(firstVSource);
			if (to) fallbackRefNode = to;
		}
		if (!fallbackRefNode) {
			const degree = new Map<string, number>();
			const order: string[] = [];
			for (const el of netlist.elements) {
				const { from, to } = resolveElementEndpoints(el);
				for (const n of [from, to]) {
					if (!n) continue;
					if (!degree.has(n)) {
						degree.set(n, 0);
						order.push(n);
					}
					degree.set(n, degree.get(n)! + 1);
				}
			}
			order.sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0));
			fallbackRefNode = order[0] ?? null;
		}
	}

	const normNode = (name: string): string => {
		const trimmed = name.trim();
		if (fallbackRefNode && trimmed === fallbackRefNode) return '0';
		return rawNormalize(trimmed);
	};

	// 2. Normalize elements and ensure unique deterministic IDs
	const usedIds = new Set<string>();
	const prefixCounters = new Map<string, number>();
	const nextUniqueId = (kind: ComponentKind, preferred?: string): string => {
		const clean = preferred?.trim();
		if (clean && !usedIds.has(clean)) {
			usedIds.add(clean);
			return clean;
		}
		const prefix = KIND_PREFIX[kind] ?? 'X';
		let idx = (prefixCounters.get(prefix) ?? 0) + 1;
		while (usedIds.has(`${prefix}${idx}`)) {
			idx++;
		}
		prefixCounters.set(prefix, idx);
		const generated = `${prefix}${idx}`;
		usedIds.add(generated);
		return generated;
	};

	const twoTerminalElements: NormalizedElement[] = [];
	const explicitGroundElements: NormalizedElement[] = [];
	const terminalElements: NormalizedElement[] = [];

	for (const el of netlist.elements) {
		const { from, to } = resolveElementEndpoints(el);
		const normFrom = normNode(from);
		const normTo = normNode(to);
		const id = nextUniqueId(el.kind, el.id);
		const label = el.label?.trim() || id;

		const normalized: NormalizedElement = {
			id,
			kind: el.kind,
			label,
			from: normFrom,
			to: normTo,
			value: typeof el.value === 'string' ? el.value.trim() : String(el.value ?? '').trim(),
			phaseDeg: el.phaseDeg,
			terminalName: el.terminalName,
			controlRef: el.controlRef
		};

		if (el.kind === 'ground') {
			explicitGroundElements.push(normalized);
		} else if (el.kind === 'terminal') {
			terminalElements.push(normalized);
		} else {
			twoTerminalElements.push(normalized);
		}
	}

	// 3. Collect all non-reference nodes and order them left-to-right via source-seeded BFS
	const encounterOrder: string[] = [];
	const nonRefSet = new Set<string>();
	const registerNode = (n: string) => {
		if (!n || n === '0' || nonRefSet.has(n)) return;
		nonRefSet.add(n);
		encounterOrder.push(n);
	};

	for (const el of twoTerminalElements) {
		registerNode(el.from);
		registerNode(el.to);
	}
	for (const el of terminalElements) {
		registerNode(el.from);
	}

	const adj = new Map<string, string[]>();
	for (const n of encounterOrder) adj.set(n, []);
	for (const el of twoTerminalElements) {
		if (el.from !== '0' && el.to !== '0' && el.from !== el.to) {
			adj.get(el.from)!.push(el.to);
			adj.get(el.to)!.push(el.from);
		}
	}

	// Seed BFS with source-connected non-ref nodes first (sources on the left)
	const seedNodes: string[] = [];
	const seedSet = new Set<string>();
	const addSeed = (n: string) => {
		if (n !== '0' && nonRefSet.has(n) && !seedSet.has(n)) {
			seedSet.add(n);
			seedNodes.push(n);
		}
	};

	for (const el of twoTerminalElements) {
		if (el.kind === 'voltage_source' && el.from !== '0') addSeed(el.from);
		if (el.kind === 'current_source' && el.to !== '0' && el.from === '0') addSeed(el.to);
	}
	for (const el of twoTerminalElements) {
		if (el.kind === 'voltage_source' || el.kind === 'current_source') {
			if (el.from !== '0') addSeed(el.from);
			if (el.to !== '0') addSeed(el.to);
		}
	}

	const orderedNodes: string[] = [];
	const visited = new Set<string>();
	const bfsFrom = (start: string) => {
		if (visited.has(start)) return;
		const queue = [start];
		visited.add(start);
		while (queue.length > 0) {
			const curr = queue.shift()!;
			orderedNodes.push(curr);
			for (const nxt of adj.get(curr) ?? []) {
				if (!visited.has(nxt)) {
					visited.add(nxt);
					queue.push(nxt);
				}
			}
		}
	};

	for (const s of seedNodes) bfsFrom(s);
	for (const n of encounterOrder) bfsFrom(n);

	const nodeToCol = new Map<string, number>();
	orderedNodes.forEach((n, idx) => nodeToCol.set(n, idx));

	// 4. Partition 2-terminal elements into shunts, horizontal branches, and self-shorts
	const shuntsByNode = new Map<number, NormalizedElement[]>();
	for (let i = 0; i < orderedNodes.length; i++) shuntsByNode.set(i, []);

	const horizontalEdges: Array<{ el: NormalizedElement; colLeft: number; colRight: number }> = [];
	const selfShortNonRef: Array<{ el: NormalizedElement; col: number }> = [];
	const selfShortGround: NormalizedElement[] = [];

	for (const el of twoTerminalElements) {
		if (el.from === el.to) {
			if (el.from === '0') {
				selfShortGround.push(el);
			} else {
				selfShortNonRef.push({ el, col: nodeToCol.get(el.from)! });
			}
			continue;
		}
		if (el.from === '0' || el.to === '0') {
			const nonRef = el.from === '0' ? el.to : el.from;
			const col = nodeToCol.get(nonRef)!;
			shuntsByNode.get(col)!.push(el);
			continue;
		}
		const cA = nodeToCol.get(el.from)!;
		const cB = nodeToCol.get(el.to)!;
		horizontalEdges.push({
			el,
			colLeft: Math.min(cA, cB),
			colRight: Math.max(cA, cB)
		});
	}

	// 5. Assign non-overlapping column X coordinates
	// Each column i has its main vertical spine at colMainX[i] and its shunt tracks
	// extending rightward by (max(1, shuntCount) - 1) * 4, followed by an 8-unit gap.
	const colMainX: number[] = [];
	const colRightEdgeX: number[] = [];
	let cursorX = 4;
	for (let i = 0; i < orderedNodes.length; i++) {
		const shuntCount = shuntsByNode.get(i)!.length;
		const spanWidth = Math.max(0, shuntCount - 1) * 4;
		colMainX.push(cursorX);
		colRightEdgeX.push(cursorX + spanWidth);
		cursorX += spanWidth + 8;
	}

	// 6. Assign horizontal tracks (spanning arches on top, adjacent edges below)
	const spanningEdges = horizontalEdges
		.filter((e) => e.colRight - e.colLeft >= 2)
		.sort((a, b) => {
			const spanDiff = b.colRight - b.colLeft - (a.colRight - a.colLeft);
			if (spanDiff !== 0) return spanDiff;
			return a.colLeft - b.colLeft;
		});

	const adjacentEdges = horizontalEdges
		.filter((e) => e.colRight - e.colLeft === 1)
		.sort((a, b) => a.colLeft - b.colLeft);

	// Pack spanning edges: two spanning edges can share a row ONLY if their closed
	// column intervals [colLeft, colRight] are strictly disjoint (colRight1 < colLeft2).
	const spanningRows: Array<Array<{ el: NormalizedElement; colLeft: number; colRight: number }>> = [];
	for (const edge of spanningEdges) {
		let placed = false;
		for (const row of spanningRows) {
			const overlaps = row.some(
				(other) => !(edge.colRight < other.colLeft || edge.colLeft > other.colRight)
			);
			if (!overlaps) {
				row.push(edge);
				placed = true;
				break;
			}
		}
		if (!placed) {
			spanningRows.push([edge]);
		}
	}

	// Pack adjacent edges: edges for the same (colLeft, colRight) stack on separate rows;
	// edges in different adjacent intervals (e.g. (0,1) and (1,2)) can share a row cleanly.
	const adjRowsByPair = new Map<number, number>();
	const adjacentPlaced: Array<{
		el: NormalizedElement;
		colLeft: number;
		colRight: number;
		localRow: number;
	}> = [];
	let maxAdjRowCount = 0;
	for (const edge of adjacentEdges) {
		const localRow = adjRowsByPair.get(edge.colLeft) ?? 0;
		adjRowsByPair.set(edge.colLeft, localRow + 1);
		maxAdjRowCount = Math.max(maxAdjRowCount, localRow + 1);
		adjacentPlaced.push({ ...edge, localRow });
	}

	const TOP_Y = 4;
	const TRACK_STEP = 4;
	const spanningRowCount = spanningRows.length;
	const adjStartY = TOP_Y + spanningRowCount * TRACK_STEP;

	const horizontalPlacements: HorizontalPlacement[] = [];

	const computeHorizontalRotation = (el: NormalizedElement): Rotation => {
		const cFrom = nodeToCol.get(el.from)!;
		const cTo = nodeToCol.get(el.to)!;
		return cFrom < cTo ? 0 : 180;
	};

	// Place spanning components in the open gap immediately to the left of `colRight`
	// so the component body [cx - 2, cx + 2] never crosses any intermediate column spine.
	spanningRows.forEach((row, rowIdx) => {
		const y = TOP_Y + rowIdx * TRACK_STEP;
		for (const edge of row) {
			const cx = colMainX[edge.colRight] - 4;
			horizontalPlacements.push({
				el: edge.el,
				colLeft: edge.colLeft,
				colRight: edge.colRight,
				row: rowIdx,
				y,
				cx,
				rotation: computeHorizontalRotation(edge.el)
			});
		}
	});

	for (const edge of adjacentPlaced) {
		const y = adjStartY + edge.localRow * TRACK_STEP;
		const cx = colMainX[edge.colRight] - 4;
		horizontalPlacements.push({
			el: edge.el,
			colLeft: edge.colLeft,
			colRight: edge.colRight,
			row: spanningRowCount + edge.localRow,
			y,
			cx,
			rotation: computeHorizontalRotation(edge.el)
		});
	}

	// Self-shorted non-ref components sit in a dedicated band below horizontal tracks
	const selfShortRowsByCol = new Map<number, number>();
	let maxSelfShortRows = 0;
	for (const item of selfShortNonRef) {
		const r = (selfShortRowsByCol.get(item.col) ?? 0) + 1;
		selfShortRowsByCol.set(item.col, r);
		maxSelfShortRows = Math.max(maxSelfShortRows, r);
	}

	const horizTotalRows = spanningRowCount + maxAdjRowCount;
	const selfShortStartY =
		horizTotalRows > 0 ? TOP_Y + horizTotalRows * TRACK_STEP : TOP_Y + 4;
	const shuntTopY =
		selfShortStartY + (maxSelfShortRows > 0 ? maxSelfShortRows * TRACK_STEP : 0);
	const shuntCenterY = shuntTopY + 2;
	const groundY = shuntTopY + 4;

	// 7. Build CircuitComponents and CircuitWires
	const components: CircuitComponent[] = [];
	const wires: CircuitWire[] = [];
	let wireCounter = 0;
	const addWire = (pts: Array<[number, number]>) => {
		// Skip degenerate 0-length 2-point wires
		if (pts.length === 2 && pts[0][0] === pts[1][0] && pts[0][1] === pts[1][1]) {
			return;
		}
		wireCounter++;
		wires.push(makeWire(`w${wireCounter}`, pts));
	};

	const toComponent = (
		el: NormalizedElement,
		x: number,
		y: number,
		rotation: Rotation
	): CircuitComponent => {
		const comp: CircuitComponent = {
			id: el.id,
			kind: el.kind,
			label: el.label,
			x,
			y,
			rotation,
			value: el.value
		};
		if (el.phaseDeg !== undefined) comp.phaseDeg = el.phaseDeg;
		if (el.terminalName !== undefined) comp.terminalName = el.terminalName;
		if (el.controlRef !== undefined) comp.controlRef = el.controlRef;
		return comp;
	};

	// Track min/max Y touched on each node's main vertical spine
	const nodeSpineYs = new Map<number, number[]>();
	for (let i = 0; i < orderedNodes.length; i++) nodeSpineYs.set(i, []);

	// Place horizontal components and their left/right connecting wires
	for (const hp of horizontalPlacements) {
		components.push(toComponent(hp.el, hp.cx, hp.y, hp.rotation));
		const xLeftBus = colMainX[hp.colLeft];
		const xRightBus = colMainX[hp.colRight];
		addWire([
			[xLeftBus, hp.y],
			[hp.cx - 2, hp.y]
		]);
		addWire([
			[hp.cx + 2, hp.y],
			[xRightBus, hp.y]
		]);
		nodeSpineYs.get(hp.colLeft)!.push(hp.y);
		nodeSpineYs.get(hp.colRight)!.push(hp.y);
	}

	// Place self-shorted non-ref components on small horizontal stubs attached to node spine
	const selfShortIdxByCol = new Map<number, number>();
	for (const item of selfShortNonRef) {
		const idx = selfShortIdxByCol.get(item.col) ?? 0;
		selfShortIdxByCol.set(item.col, idx + 1);
		const y = selfShortStartY + idx * TRACK_STEP;
		const xBus = colMainX[item.col];
		// Place centered at xBus + 4 (rot 0 -> pins at xBus+2 and xBus+6), loop both pins back to xBus
		const cx = xBus + 4;
		components.push(toComponent(item.el, cx, y, 0));
		addWire([
			[xBus, y],
			[cx - 2, y]
		]);
		addWire([
			[cx + 2, y],
			[cx + 2, y + 2],
			[xBus, y + 2],
			[xBus, y]
		]);
		nodeSpineYs.get(item.col)!.push(y);
	}

	// Place shunt components (vertical between shuntTopY and groundY)
	const groundPinXs: number[] = [];
	for (let col = 0; col < orderedNodes.length; col++) {
		const shunts = shuntsByNode.get(col)!;
		if (shunts.length === 0) continue;

		const baseX = colMainX[col];
		nodeSpineYs.get(col)!.push(shuntTopY);

		shunts.forEach((el, idx) => {
			const sx = baseX + idx * 4;
			// rot 90: pin 0 at (sx, shuntTopY), pin 1 at (sx, groundY)
			// rot 270: pin 0 at (sx, groundY), pin 1 at (sx, shuntTopY)
			const rot: Rotation = el.from !== '0' ? 90 : 270;
			components.push(toComponent(el, sx, shuntCenterY, rot));
			groundPinXs.push(sx);
		});

		if (shunts.length > 1) {
			addWire([
				[baseX, shuntTopY],
				[baseX + (shunts.length - 1) * 4, shuntTopY]
			]);
		}
	}

	// Place terminal components on their node spine (or ground rail)
	for (const term of terminalElements) {
		if (term.from === '0') {
			const tx = groundPinXs[0] ?? 4;
			components.push(toComponent(term, tx, groundY, 0));
			groundPinXs.push(tx);
		} else {
			const col = nodeToCol.get(term.from)!;
			const ys = nodeSpineYs.get(col)!;
			const ty = ys.length > 0 ? ys[0] : shuntTopY;
			ys.push(ty);
			components.push(toComponent(term, colMainX[col], ty, 0));
		}
	}

	// Emit each non-ref node's vertical spine wire
	for (let col = 0; col < orderedNodes.length; col++) {
		const ys = nodeSpineYs.get(col)!;
		if (ys.length < 2) continue;
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		if (maxY > minY) {
			addWire([
				[colMainX[col], minY],
				[colMainX[col], maxY]
			]);
		}
	}

	// Place self-shorted ground elements along the right end of the ground rail
	if (selfShortGround.length > 0) {
		let gx = (groundPinXs.length > 0 ? Math.max(...groundPinXs) : 4) + 6;
		for (const el of selfShortGround) {
			components.push(toComponent(el, gx, groundY, 0));
			groundPinXs.push(gx - 2, gx + 2);
			gx += 8;
		}
	}

	// Emit horizontal ground rail and ground symbol(s)
	const minGndX = groundPinXs.length > 0 ? Math.min(...groundPinXs) : 4;
	const maxGndX = groundPinXs.length > 0 ? Math.max(...groundPinXs) : 4;
	if (maxGndX > minGndX) {
		addWire([
			[minGndX, groundY],
			[maxGndX, groundY]
		]);
	}

	if (explicitGroundElements.length > 0) {
		const gnd = explicitGroundElements[0];
		components.push(toComponent(gnd, minGndX, groundY, 0));
	} else {
		const gndId = nextUniqueId('ground');
		components.push({
			id: gndId,
			kind: 'ground',
			label: 'GND',
			x: minGndX,
			y: groundY,
			rotation: 0,
			value: '0'
		});
	}

	const doc: CircuitDocument = {
		schemaVersion: 1,
		mode,
		frequencyHz,
		components,
		wires
	};
	if (netlist.id) doc.id = netlist.id;
	if (netlist.name) doc.name = netlist.name;
	if (acMagnitudeMode) doc.acMagnitudeMode = acMagnitudeMode;

	return doc;
}
