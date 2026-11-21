/**
 * Schematic geometry -> electrical node graph builder (Union-Find with T-junctions)
 * and circuit topology validator for DC and AC steady-state analysis.
 */

import { Complex } from './complex';
import type {
	AnalysisMode,
	CircuitComponent,
	CircuitDocument,
	GridPoint,
	NodePinAttachment,
	Rotation,
	ValidationDiagnostic
} from './types';
import { parseComplexValue, parseEngineeringNumber } from './units';

export interface PinPosition {
	name: string;
	index: number;
	x: number;
	y: number;
}

export interface ElectricalNode {
	nodeId: string;
	isReference: boolean;
	componentPins: NodePinAttachment[];
	gridPoints: GridPoint[];
}

export interface ElectricalGraph {
	doc: CircuitDocument;
	nodes: Record<string, ElectricalNode>;
	nonRefNodeIds: string[];
	/** Maps componentId -> [nodeIdPin0, nodeIdPin1] (or [nodeIdPin0] for 1-pin components) */
	componentNodes: Record<string, string[]>;
	componentPins: Record<string, PinPosition[]>;
	diagnostics: ValidationDiagnostic[];
}

class UnionFind {
	private parent: number[];
	private rank: number[];

	constructor(size: number) {
		this.parent = Array.from({ length: size }, (_, i) => i);
		this.rank = new Array(size).fill(0);
	}

	find(x: number): number {
		let root = x;
		while (this.parent[root] !== root) {
			root = this.parent[root];
		}
		let curr = x;
		while (curr !== root) {
			const next = this.parent[curr];
			this.parent[curr] = root;
			curr = next;
		}
		return root;
	}

	union(a: number, b: number): boolean {
		const ra = this.find(a);
		const rb = this.find(b);
		if (ra === rb) return false;
		if (this.rank[ra] < this.rank[rb]) {
			this.parent[ra] = rb;
		} else if (this.rank[ra] > this.rank[rb]) {
			this.parent[rb] = ra;
		} else {
			this.parent[rb] = ra;
			this.rank[ra]++;
		}
		return true;
	}

	connected(a: number, b: number): boolean {
		return this.find(a) === this.find(b);
	}
}

function rotateOffset(dx: number, dy: number, rotation: Rotation): GridPoint {
	switch (rotation) {
		case 0:
			return { x: dx, y: dy };
		case 90:
			return { x: -dy, y: dx };
		case 180:
			return { x: -dx, y: -dy };
		case 270:
			return { x: dy, y: -dx };
	}
}

/**
 * Returns exact grid pin positions for a component, matching the canonical UI symbol contract.
 * - 2-terminal components at rotation 0: pin 0 at (x - 2, y), pin 1 at (x + 2, y)
 * - 1-terminal components ('ground', 'terminal'): pin 0 at (x, y)
 */
export function getPinPositions(comp: CircuitComponent): PinPosition[] {
	if (comp.kind === 'ground' || comp.kind === 'terminal') {
		return [
			{
				name: comp.kind === 'ground' ? 'gnd' : comp.terminalName || 't',
				index: 0,
				x: comp.x,
				y: comp.y
			}
		];
	}

	const pin0Name =
		comp.kind === 'voltage_source' ? '+' : comp.kind === 'current_source' ? 'in' : 'a';
	const pin1Name =
		comp.kind === 'voltage_source' ? '-' : comp.kind === 'current_source' ? 'out' : 'b';

	const off0 = rotateOffset(-2, 0, comp.rotation);
	const off1 = rotateOffset(2, 0, comp.rotation);

	return [
		{ name: pin0Name, index: 0, x: comp.x + off0.x, y: comp.y + off0.y },
		{ name: pin1Name, index: 1, x: comp.x + off1.x, y: comp.y + off1.y }
	];
}

function ptKey(x: number, y: number): string {
	const rx = Math.round(x * 1e6) / 1e6;
	const ry = Math.round(y * 1e6) / 1e6;
	return `${rx === 0 ? 0 : rx},${ry === 0 ? 0 : ry}`;
}

function isPointOnSegment(p: GridPoint, a: GridPoint, b: GridPoint, eps = 1e-6): boolean {
	const minX = Math.min(a.x, b.x) - eps;
	const maxX = Math.max(a.x, b.x) + eps;
	const minY = Math.min(a.y, b.y) - eps;
	const maxY = Math.max(a.y, b.y) + eps;

	if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
		return false;
	}

	const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
	const segLen = Math.hypot(b.x - a.x, b.y - a.y);
	if (segLen <= eps) {
		return Math.hypot(p.x - a.x, p.y - a.y) <= eps;
	}
	return Math.abs(cross) <= eps * segLen;
}

/**
 * Builds the canonical electrical node graph from a CircuitDocument.
 * Merges touching pins, wire endpoints, and T-junctions via Union-Find.
 * All ground pins collapse to node `"0"`; if no ground exists, picks an automatic
 * reference node `"0"` and emits an `'info'` `AUTO_GROUND` diagnostic.
 */
export function buildElectricalGraph(doc: CircuitDocument): ElectricalGraph {
	const diagnostics: ValidationDiagnostic[] = [];
	const pointList: GridPoint[] = [];
	const pointIndex = new Map<string, number>();

	const ensurePoint = (pt: GridPoint): number => {
		const key = ptKey(pt.x, pt.y);
		const existing = pointIndex.get(key);
		if (existing !== undefined) return existing;
		const id = pointList.length;
		pointList.push({ x: pt.x, y: pt.y });
		pointIndex.set(key, id);
		return id;
	};

	const componentPins: Record<string, PinPosition[]> = {};
	for (const comp of doc.components) {
		const pins = getPinPositions(comp);
		componentPins[comp.id] = pins;
		for (const pin of pins) {
			ensurePoint({ x: pin.x, y: pin.y });
		}
	}

	for (const wire of doc.wires) {
		for (const pt of wire.points) {
			ensurePoint(pt);
		}
	}

	const uf = new UnionFind(pointList.length);

	// Connect wire vertices along each polyline
	for (const wire of doc.wires) {
		for (let i = 0; i + 1 < wire.points.length; i++) {
			const idA = ensurePoint(wire.points[i]);
			const idB = ensurePoint(wire.points[i + 1]);
			uf.union(idA, idB);
		}
	}

	// Connect T-junctions: any pin or wire vertex lying on any wire segment
	for (let pId = 0; pId < pointList.length; pId++) {
		const pt = pointList[pId];
		for (const wire of doc.wires) {
			for (let i = 0; i + 1 < wire.points.length; i++) {
				const a = wire.points[i];
				const b = wire.points[i + 1];
				if (isPointOnSegment(pt, a, b)) {
					const segStartId = ensurePoint(a);
					uf.union(pId, segStartId);
				}
			}
		}
	}

	// Group points and pin attachments by Union-Find root
	interface RootBucket {
		rootId: number;
		pins: NodePinAttachment[];
		points: GridPoint[];
		hasGround: boolean;
		minY: number;
		minX: number;
	}

	const buckets = new Map<number, RootBucket>();
	const getBucket = (ptId: number): RootBucket => {
		const root = uf.find(ptId);
		let bucket = buckets.get(root);
		if (!bucket) {
			bucket = {
				rootId: root,
				pins: [],
				points: [],
				hasGround: false,
				minY: Infinity,
				minX: Infinity
			};
			buckets.set(root, bucket);
		}
		return bucket;
	};

	for (let ptId = 0; ptId < pointList.length; ptId++) {
		const pt = pointList[ptId];
		const bucket = getBucket(ptId);
		bucket.points.push(pt);
		if (pt.y < bucket.minY || (pt.y === bucket.minY && pt.x < bucket.minX)) {
			bucket.minY = pt.y;
			bucket.minX = pt.x;
		}
	}

	const compPinRoots = new Map<string, number[]>();
	for (const comp of doc.components) {
		const pins = componentPins[comp.id];
		const roots: number[] = [];
		for (const pin of pins) {
			const ptId = ensurePoint({ x: pin.x, y: pin.y });
			const root = uf.find(ptId);
			roots.push(root);
			const bucket = getBucket(ptId);
			bucket.pins.push({
				componentId: comp.id,
				pinIndex: pin.index,
				pinName: pin.name
			});
			if (comp.kind === 'ground') {
				bucket.hasGround = true;
			}
		}
		compPinRoots.set(comp.id, roots);
	}

	// Filter to buckets that contain at least one component pin
	const activeBuckets = Array.from(buckets.values()).filter((b) => b.pins.length > 0);
	const groundBuckets = activeBuckets.filter((b) => b.hasGround);

	const rootToNodeId = new Map<number, string>();

	if (groundBuckets.length > 0) {
		for (const gb of groundBuckets) {
			rootToNodeId.set(gb.rootId, '0');
		}
	} else if (activeBuckets.length > 0) {
		// Pick auto-reference: prefer negative pin (index 1) of first voltage_source, else highest degree
		let autoRoot: number | null = null;
		const firstVSource = doc.components.find((c) => c.kind === 'voltage_source');
		if (firstVSource) {
			const roots = compPinRoots.get(firstVSource.id);
			if (roots && roots.length >= 2) {
				autoRoot = roots[1];
			}
		}

		if (autoRoot === null) {
			const sortedByDegree = [...activeBuckets].sort((a, b) => {
				if (b.pins.length !== a.pins.length) return b.pins.length - a.pins.length;
				if (a.minY !== b.minY) return a.minY - b.minY;
				return a.minX - b.minX;
			});
			autoRoot = sortedByDegree[0].rootId;
		}

		rootToNodeId.set(autoRoot, '0');
		diagnostics.push({
			severity: 'info',
			code: 'AUTO_GROUND',
			message: 'No ground symbol found; automatically selected reference node "0".',
			nodeIds: ['0']
		});
	}

	// Assign deterministic labels N1, N2, ... to non-reference buckets
	const nonRefBuckets = activeBuckets
		.filter((b) => rootToNodeId.get(b.rootId) !== '0')
		.sort((a, b) => {
			if (a.minY !== b.minY) return a.minY - b.minY;
			if (a.minX !== b.minX) return a.minX - b.minX;
			return a.rootId - b.rootId;
		});

	const nonRefNodeIds: string[] = [];
	nonRefBuckets.forEach((b, idx) => {
		const id = `N${idx + 1}`;
		rootToNodeId.set(b.rootId, id);
		nonRefNodeIds.push(id);
	});

	// Build final nodes dictionary (merging multiple ground buckets into single "0" node)
	const nodes: Record<string, ElectricalNode> = {};
	for (const bucket of activeBuckets) {
		const nodeId = rootToNodeId.get(bucket.rootId)!;
		if (!nodes[nodeId]) {
			nodes[nodeId] = {
				nodeId,
				isReference: nodeId === '0',
				componentPins: [],
				gridPoints: []
			};
		}
		nodes[nodeId].componentPins.push(...bucket.pins);
		nodes[nodeId].gridPoints.push(...bucket.points);
	}

	const componentNodes: Record<string, string[]> = {};
	for (const comp of doc.components) {
		const roots = compPinRoots.get(comp.id) ?? [];
		componentNodes[comp.id] = roots.map((r) => rootToNodeId.get(r)!);
	}

	return {
		doc,
		nodes,
		nonRefNodeIds,
		componentNodes,
		componentPins,
		diagnostics
	};
}

/**
 * Parses a source's complex phasor or scalar DC value cleanly.
 */
export function parseSourceValue(comp: CircuitComponent, mode: AnalysisMode): Complex | null {
	const raw = comp.value?.trim() ?? '';
	if (raw === '' && comp.numericValue !== undefined) {
		if (!Number.isFinite(comp.numericValue)) return null;
		if (mode === 'ac' && comp.phaseDeg !== undefined && Number.isFinite(comp.phaseDeg)) {
			return Complex.fromPolar(comp.numericValue, comp.phaseDeg);
		}
		return Complex.from(comp.numericValue, 0);
	}

	const parsed = parseComplexValue(raw);
	if (!parsed || !parsed.isFinite()) return null;

	if (mode === 'dc') {
		if (!parsed.isReal(1e-12)) {
			return null;
		}
		return Complex.from(parsed.re, 0);
	}

	// AC mode: apply comp.phaseDeg if raw value didn't already carry angle/imaginary part
	const hasExplicitAngleOrJ = /[∠@j]/i.test(raw);
	if (!hasExplicitAngleOrJ && comp.phaseDeg !== undefined && Number.isFinite(comp.phaseDeg)) {
		return Complex.fromPolar(parsed.re, comp.phaseDeg);
	}

	return parsed;
}

/**
 * Parses a passive component's positive scalar value (R, L, or C).
 */
export function parsePassiveValue(comp: CircuitComponent): number | null {
	const raw = comp.value?.trim() ?? '';
	const val =
		raw !== ''
			? parseEngineeringNumber(raw)
			: comp.numericValue !== undefined
				? comp.numericValue
				: null;
	if (val === null || !Number.isFinite(val) || val <= 0) {
		return null;
	}
	return val;
}

/**
 * Validates electrical topology, component values, voltage-source loops,
 * current-source cutsets, and disconnected floating subcircuits.
 */
export function validateCircuitTopology(
	graph: ElectricalGraph,
	mode: AnalysisMode,
	frequencyHz: number
): ValidationDiagnostic[] {
	const diagnostics: ValidationDiagnostic[] = [...graph.diagnostics];
	const { doc, nodes, componentNodes } = graph;

	const activeComponents = doc.components.filter(
		(c) => c.kind !== 'ground' && c.kind !== 'terminal'
	);

	if (activeComponents.length === 0) {
		diagnostics.push({
			severity: 'error',
			code: 'EMPTY_CIRCUIT',
			message: 'Circuit contains no active components to solve.'
		});
		return diagnostics;
	}

	if (mode === 'ac' && (!Number.isFinite(frequencyHz) || frequencyHz <= 0)) {
		diagnostics.push({
			severity: 'error',
			code: 'INVALID_FREQUENCY',
			message: `AC frequency must be a positive finite number (received ${frequencyHz}).`
		});
	}

	let hasCapacitor = false;
	let hasInductor = false;

	// Validate individual component values and self-shorted warnings
	for (const comp of activeComponents) {
		const cNodes = componentNodes[comp.id] ?? [];
		if (comp.kind === 'resistor' || comp.kind === 'capacitor' || comp.kind === 'inductor') {
			if (comp.kind === 'capacitor') hasCapacitor = true;
			if (comp.kind === 'inductor') hasInductor = true;

			const val = parsePassiveValue(comp);
			if (val === null) {
				diagnostics.push({
					severity: 'error',
					code: 'INVALID_VALUE',
					message: `${comp.label} (${comp.kind}) must have a positive finite value (got "${comp.value}").`,
					componentIds: [comp.id]
				});
			}

			if (cNodes.length === 2 && cNodes[0] === cNodes[1]) {
				if (mode === 'dc' && comp.kind === 'inductor') {
					diagnostics.push({
						severity: 'error',
						code: 'VOLTAGE_SOURCE_LOOP',
						message: `Inductor ${comp.label} is shorted across node ${cNodes[0]} in DC steady state, forming a 0 V loop.`,
						componentIds: [comp.id],
						nodeIds: [cNodes[0]]
					});
				} else {
					diagnostics.push({
						severity: 'warning',
						code: 'SHORTED_COMPONENT',
						message: `${comp.label} has both terminals connected to node ${cNodes[0]} (zero voltage).`,
						componentIds: [comp.id],
						nodeIds: [cNodes[0]]
					});
				}
			}
		} else if (comp.kind === 'voltage_source' || comp.kind === 'current_source') {
			const val = parseSourceValue(comp, mode);
			if (val === null) {
				diagnostics.push({
					severity: 'error',
					code: 'INVALID_VALUE',
					message: `${comp.label} (${comp.kind}) has an invalid ${mode.toUpperCase()} value ("${comp.value}").`,
					componentIds: [comp.id]
				});
			}
			if (comp.kind === 'current_source' && cNodes.length === 2 && cNodes[0] === cNodes[1]) {
				diagnostics.push({
					severity: 'warning',
					code: 'SHORTED_COMPONENT',
					message: `Current source ${comp.label} is shorted across node ${cNodes[0]}.`,
					componentIds: [comp.id],
					nodeIds: [cNodes[0]]
				});
			}
		}
	}

	if (mode === 'dc') {
		if (hasCapacitor) {
			diagnostics.push({
				severity: 'info',
				code: 'DC_CAPACITOR_OPEN',
				message:
					'DC steady-state model: ideal capacitors are treated as open circuits (I = 0 A).'
			});
		}
		if (hasInductor) {
			diagnostics.push({
				severity: 'info',
				code: 'DC_INDUCTOR_SHORT',
				message:
					'DC steady-state model: ideal inductors are treated as short circuits (0 V branch, V = 0 V).'
			});
		}
	}

	// Node indexing for topology checks
	const allNodeIds = Object.keys(nodes);
	const nodeIdx = new Map<string, number>();
	allNodeIds.forEach((id, i) => nodeIdx.set(id, i));

	// 1. Check for voltage-source / DC-inductor loops (zero-impedance cycles)
	const ufZero = new UnionFind(allNodeIds.length);
	const zeroBranches = activeComponents.filter(
		(c) => c.kind === 'voltage_source' || (mode === 'dc' && c.kind === 'inductor')
	);

	for (const zb of zeroBranches) {
		const [nA, nB] = componentNodes[zb.id] ?? [];
		if (!nA || !nB) continue;
		const iA = nodeIdx.get(nA)!;
		const iB = nodeIdx.get(nB)!;
		if (nA === nB) {
			// Inductor self-short already reported above; voltage_source self-short reported here
			if (zb.kind === 'voltage_source') {
				diagnostics.push({
					severity: 'error',
					code: 'VOLTAGE_SOURCE_LOOP',
					message: `Voltage source ${zb.label} is shorted across node ${nA}.`,
					componentIds: [zb.id],
					nodeIds: [nA]
				});
			}
		} else if (ufZero.connected(iA, iB)) {
			diagnostics.push({
				severity: 'error',
				code: 'VOLTAGE_SOURCE_LOOP',
				message: `Ideal voltage-source / DC-inductor loop detected involving ${zb.label} between ${nA} and ${nB}.`,
				componentIds: [zb.id],
				nodeIds: [nA, nB]
			});
		} else {
			ufZero.union(iA, iB);
		}
	}

	// 2. Check conducting connectivity without current sources (and without DC open capacitors)
	const refIdx = nodeIdx.get('0');
	if (refIdx === undefined) {
		return diagnostics;
	}

	const ufNoCS = new UnionFind(allNodeIds.length);
	for (const comp of activeComponents) {
		if (comp.kind === 'current_source') continue;
		if (mode === 'dc' && comp.kind === 'capacitor') continue;
		const [nA, nB] = componentNodes[comp.id] ?? [];
		if (!nA || !nB) continue;
		ufNoCS.union(nodeIdx.get(nA)!, nodeIdx.get(nB)!);
	}

	const refRoot = ufNoCS.find(refIdx);
	const isolatedClusters = new Map<number, string[]>();
	for (const id of allNodeIds) {
		const idx = nodeIdx.get(id)!;
		const root = ufNoCS.find(idx);
		if (root !== refRoot) {
			const list = isolatedClusters.get(root) ?? [];
			list.push(id);
			isolatedClusters.set(root, list);
		}
	}

	for (const clusterNodes of isolatedClusters.values()) {
		const clusterSet = new Set(clusterNodes);
		const touchingCurrentSources = activeComponents.filter(
			(c) =>
				c.kind === 'current_source' &&
				(componentNodes[c.id] ?? []).some((nid) => clusterSet.has(nid))
		);

		if (touchingCurrentSources.length > 0) {
			const csLabels = touchingCurrentSources.map((c) => c.label).join(', ');
			diagnostics.push({
				severity: 'error',
				code: 'CURRENT_SOURCE_CUTSET',
				message: `Current-source cutset / open current source at node(s) ${clusterNodes.join(', ')} (${csLabels}); KCL cannot uniquely determine node voltages.`,
				componentIds: touchingCurrentSources.map((c) => c.id),
				nodeIds: clusterNodes
			});
		} else {
			const touchingComps = activeComponents
				.filter((c) => (componentNodes[c.id] ?? []).some((nid) => clusterSet.has(nid)))
				.map((c) => c.id);
			const onlyDcCap =
				mode === 'dc' &&
				activeComponents.some(
					(c) =>
						c.kind === 'capacitor' &&
						(componentNodes[c.id] ?? []).some((nid) => clusterSet.has(nid))
				) &&
				touchingComps.every((id) => {
					const comp = activeComponents.find((c) => c.id === id);
					return comp?.kind === 'capacitor';
				});

			diagnostics.push({
				severity: 'error',
				code: 'FLOATING_SUBCIRCUIT',
				message: onlyDcCap
					? `Node(s) ${clusterNodes.join(', ')} have no DC conducting path to reference node "0" (isolated by open capacitor(s) in DC mode).`
					: `Floating subcircuit detected at node(s) ${clusterNodes.join(', ')} with no path to reference node "0".`,
				componentIds: touchingComps,
				nodeIds: clusterNodes
			});
		}
	}

	return diagnostics;
}
