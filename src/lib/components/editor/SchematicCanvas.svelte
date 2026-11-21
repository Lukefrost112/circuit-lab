<script lang="ts">
	import {
		BookOpen,
		CornerDownRight,
		Eraser,
		FileCode2,
		Minus,
		Plus,
		Redo2,
		RotateCcw,
		RotateCw,
		Scan,
		SlidersHorizontal,
		Sparkles,
		Target,
		Trash2,
		Undo2,
		X
	} from 'lucide-svelte';
	import { CircuitSymbol, GRID_SIZE, PALETTE_ITEMS } from '$lib/components/symbols';
	import { Badge, Button, Separator, Tooltip } from '$lib/components/ui';
	import {
		Complex,
		getPinPositions,
		type CircuitComponent,
		type CircuitWire,
		type ComponentKind,
		type GridPoint
	} from '$lib/engine';
	import { circuit, type EditorTool } from '$lib/stores/circuit.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { cn } from '$lib/utils';
	import {
		computeJunctionPoints,
		computeManhattanPoints,
		computePinchTransform,
		computeTouchPinHitRadiusWorld,
		formatComplexOverlay,
		formatComponentDisplayValue,
		type WireBendMode
	} from './helpers';
	import {
		buildSchematicObstacles,
		chooseBranchPillPosition,
		chooseNodePillPosition,
		type LayoutRect
	} from './overlayLayout';

	interface Props {
		onOpenPresets?: () => void;
		onOpenImport?: () => void;
		onOpenAiImport?: () => void;
		onComponentInspect?: (id: string) => void;
		onOpenPalette?: () => void;
		onMobileInspect?: (id?: string) => void;
		class?: string;
	}

	let {
		onOpenPresets,
		onOpenImport,
		onOpenAiImport,
		onComponentInspect,
		onOpenPalette,
		onMobileInspect,
		class: className
	}: Props = $props();

	let containerEl = $state<HTMLDivElement | undefined>(undefined);
	let svgEl = $state<SVGSVGElement | undefined>(undefined);
	let viewportW = $state(0);
	let viewportH = $state(0);

	let zoom = $state(1);
	let pan = $state({ x: 80, y: 60 });
	let needsFit = $state(true);
	let lastLoadedDocId = $state<string | undefined>(circuit.document.id);

	// Interaction states
	let hoverGrid = $state<GridPoint | null>(null);
	let hoverSnappedPin = $state<GridPoint | null>(null);
	let hoveredNodeId = $state<string | null>(null);
	let pinnedProbeNodeId = $state<string | null>(null);

	let wireStart = $state<GridPoint | null>(null);
	let wireBendMode = $state<WireBendMode>('hv');
	let wireStartedFromSelect = $state(false);

	let spaceHeld = $state(false);
	const activePointers = new Map<
		number,
		{ clientX: number; clientY: number; pointerType: string }
	>();
	let pinchState = $state<{
		startZoom: number;
		startMidX: number;
		startMidY: number;
		startDist: number;
		startPanX: number;
		startPanY: number;
	} | null>(null);

	let dragState = $state<
		| {
				kind: 'pan';
				pointerId: number;
				pointerType: string;
				startClientX: number;
				startClientY: number;
				startPanX: number;
				startPanY: number;
				moved: boolean;
		  }
		| {
				kind: 'component';
				pointerId: number;
				pointerType: string;
				componentId: string;
				offsetGx: number;
				offsetGy: number;
				origGx: number;
				origGy: number;
				snapshotRecorded: boolean;
		  }
		| null
	>(null);

	const PLACEMENT_KINDS = new Set<string>([
		'resistor',
		'capacitor',
		'inductor',
		'voltage_source',
		'current_source',
		'ground',
		'terminal'
	]);

	function isPlacementTool(tool: EditorTool): tool is ComponentKind {
		return PLACEMENT_KINDS.has(tool);
	}

	const junctions = $derived(
		computeJunctionPoints(circuit.document.components, circuit.document.wires)
	);

	const allPins = $derived.by(() => {
		const list: Array<{ componentId: string; x: number; y: number; name: string; index: number }> =
			[];
		for (const comp of circuit.document.components) {
			for (const pin of getPinPositions(comp)) {
				list.push({
					componentId: comp.id,
					x: pin.x,
					y: pin.y,
					name: pin.name,
					index: pin.index
				});
			}
		}
		return list;
	});

	const wirePreviewPoints = $derived.by<GridPoint[]>(() => {
		if (!wireStart || !hoverGrid) return [];
		const target = hoverSnappedPin ?? hoverGrid;
		return computeManhattanPoints(wireStart, target, wireBendMode);
	});

	const nodeCount = $derived(Object.keys(circuit.graph.nodes).length);
	const hasErrors = $derived(
		circuit.solution.mna.diagnostics.some((d) => d.severity === 'error')
	);

	const pinHitRadiusWorld = $derived(computeTouchPinHitRadiusWorld(zoom, 24));
	const wireHitStrokeWidth = $derived(Math.max(14, 28 / Math.max(0.2, zoom)));

	// Mark document for refit whenever switching to a different loaded document id
	$effect(() => {
		const docId = circuit.document.id;
		if (docId !== lastLoadedDocId) {
			lastLoadedDocId = docId;
			if (docId) {
				needsFit = true;
			}
		}
	});

	// Fit schematic neatly only once the canvas has a non-zero visible viewport
	$effect(() => {
		const compCount = circuit.document.components.length;
		if (needsFit && viewportW > 0 && viewportH > 0 && compCount > 0) {
			fitToView();
			needsFit = false;
		}
	});

	export function fitToView(): void {
		const comps = circuit.document.components;
		const wires = circuit.document.wires;
		if (comps.length === 0 && wires.length === 0) {
			zoom = 1;
			pan = { x: 80, y: 60 };
			return;
		}

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const c of comps) {
			minX = Math.min(minX, (c.x - 3) * GRID_SIZE);
			maxX = Math.max(maxX, (c.x + 3) * GRID_SIZE);
			minY = Math.min(minY, (c.y - 2.5) * GRID_SIZE);
			maxY = Math.max(maxY, (c.y + 2.5) * GRID_SIZE);
		}
		for (const w of wires) {
			for (const pt of w.points) {
				minX = Math.min(minX, (pt.x - 1) * GRID_SIZE);
				maxX = Math.max(maxX, (pt.x + 1) * GRID_SIZE);
				minY = Math.min(minY, (pt.y - 1) * GRID_SIZE);
				maxY = Math.max(maxY, (pt.y + 1) * GRID_SIZE);
			}
		}

		if (settings.showLiveOverlays) {
			for (const br of overlayLayout.branches) {
				minX = Math.min(minX, br.badgeX - br.pillWidth / 2);
				maxX = Math.max(maxX, br.badgeX + br.pillWidth / 2);
				minY = Math.min(minY, br.badgeY - 12);
				maxY = Math.max(maxY, br.badgeY + 12);
			}
			for (const nd of overlayLayout.nodes) {
				minX = Math.min(minX, nd.xPx - nd.pillWidth / 2);
				maxX = Math.max(maxX, nd.xPx + nd.pillWidth / 2);
				minY = Math.min(minY, nd.yPx - 12);
				maxY = Math.max(maxY, nd.yPx + 12);
			}
		}

		const contentW = Math.max(120, maxX - minX);
		const contentH = Math.max(120, maxY - minY);
		const padX = viewportW < 520 ? 32 : settings.showLiveOverlays ? 120 : 90;
		const padY = viewportH < 680 ? 112 : settings.showLiveOverlays ? 96 : 80;
		const availW = Math.max(160, viewportW - padX);
		const availH = Math.max(160, viewportH - padY);

		const nextZoom = Math.min(1.6, Math.max(0.3, Math.min(availW / contentW, availH / contentH)));
		const centerX = (minX + maxX) / 2;
		const centerY = (minY + maxY) / 2;

		zoom = nextZoom;
		pan = {
			x: viewportW / 2 - centerX * nextZoom,
			y: viewportH / 2 - centerY * nextZoom
		};
	}

	function clampZoom(z: number): number {
		return Math.min(2.5, Math.max(0.3, z));
	}

	function adjustZoom(delta: number): void {
		const nextZoom = clampZoom(zoom + delta);
		const cx = viewportW / 2;
		const cy = viewportH / 2;
		const wx = (cx - pan.x) / zoom;
		const wy = (cy - pan.y) / zoom;
		zoom = nextZoom;
		pan = {
			x: cx - wx * nextZoom,
			y: cy - wy * nextZoom
		};
	}

	function resetZoom(): void {
		const cx = viewportW / 2;
		const cy = viewportH / 2;
		const wx = (cx - pan.x) / zoom;
		const wy = (cy - pan.y) / zoom;
		zoom = 1;
		pan = {
			x: cx - wx,
			y: cy - wy
		};
	}

	function clientToGrid(clientX: number, clientY: number): { gx: number; gy: number; sx: number; sy: number } {
		if (!svgEl) return { gx: 0, gy: 0, sx: 0, sy: 0 };
		const rect = svgEl.getBoundingClientRect();
		const sx = clientX - rect.left;
		const sy = clientY - rect.top;
		const wx = (sx - pan.x) / zoom;
		const wy = (sy - pan.y) / zoom;
		return { gx: wx / GRID_SIZE, gy: wy / GRID_SIZE, sx, sy };
	}

	function getPinSnapDist(pointerType: string): number {
		if (pointerType === 'touch' || pointerType === 'pen') {
			return Math.max(0.85, 24 / (GRID_SIZE * Math.max(0.2, zoom)));
		}
		return 0.6;
	}

	function getNodeProbeDist(pointerType: string): number {
		if (pointerType === 'touch' || pointerType === 'pen') {
			return Math.max(0.95, 24 / (GRID_SIZE * Math.max(0.2, zoom)));
		}
		return 0.65;
	}

	function findNearestPin(gx: number, gy: number, maxDist = 0.6): GridPoint | null {
		let best: GridPoint | null = null;
		let bestDist = maxDist;
		for (const pin of allPins) {
			const d = Math.hypot(pin.x - gx, pin.y - gy);
			if (d <= bestDist) {
				bestDist = d;
				best = { x: pin.x, y: pin.y };
			}
		}
		return best;
	}

	function findNodeNearGrid(gx: number, gy: number, maxDist = 0.65): string | null {
		for (const [nodeId, node] of Object.entries(circuit.graph.nodes)) {
			if (node.gridPoints.some((gp) => Math.hypot(gp.x - gx, gp.y - gy) <= maxDist)) {
				return nodeId;
			}
		}
		return null;
	}

	function snapCoord(val: number): number {
		return settings.snapToGrid ? Math.round(val) : Math.round(val * 2) / 2;
	}

	function handleWheel(e: WheelEvent): void {
		e.preventDefault();
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		const sx = e.clientX - rect.left;
		const sy = e.clientY - rect.top;
		const wx = (sx - pan.x) / zoom;
		const wy = (sy - pan.y) / zoom;

		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		const nextZoom = clampZoom(zoom * factor);
		zoom = nextZoom;
		pan = {
			x: sx - wx * nextZoom,
			y: sy - wy * nextZoom
		};
	}

	function startWireAt(pt: GridPoint, fromSelect: boolean): void {
		wireStart = { x: pt.x, y: pt.y };
		wireStartedFromSelect = fromSelect;
		wireBendMode = 'hv';
	}

	function finishWireAt(endPt: GridPoint): void {
		if (!wireStart) return;
		const pts = computeManhattanPoints(wireStart, endPt, wireBendMode);
		circuit.addWire(pts);
		wireStart = null;
		if (wireStartedFromSelect) {
			wireStartedFromSelect = false;
		}
	}

	function isPrimaryPointerDown(e: PointerEvent): boolean {
		if (e.pointerType === 'mouse') {
			return e.button === 0;
		}
		return e.button === 0 || e.button === -1;
	}

	function beginPinchFromActivePointers(): void {
		if (!svgEl || activePointers.size < 2) return;
		const pts = Array.from(activePointers.values());
		const p1 = pts[0];
		const p2 = pts[1];
		const rect = svgEl.getBoundingClientRect();
		const x1 = p1.clientX - rect.left;
		const y1 = p1.clientY - rect.top;
		const x2 = p2.clientX - rect.left;
		const y2 = p2.clientY - rect.top;

		// Cancel any in-progress single-finger pan or component drag cleanly
		dragState = null;

		pinchState = {
			startZoom: zoom,
			startMidX: (x1 + x2) / 2,
			startMidY: (y1 + y2) / 2,
			startDist: Math.hypot(x2 - x1, y2 - y1),
			startPanX: pan.x,
			startPanY: pan.y
		};
	}

	/**
	 * Tracks active pointers on pointerdown. Returns true if a two-finger pinch
	 * gesture is active so callers skip single-pointer selection/drag/wiring.
	 */
	function trackPointerDown(e: PointerEvent): boolean {
		if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) {
			return false;
		}
		activePointers.set(e.pointerId, {
			clientX: e.clientX,
			clientY: e.clientY,
			pointerType: e.pointerType
		});

		if (activePointers.size >= 2) {
			if (!pinchState) {
				beginPinchFromActivePointers();
			}
			return true;
		}
		return false;
	}

	function handleBackgroundPointerDown(e: PointerEvent): void {
		if (e.pointerType === 'mouse' && e.button === 2) {
			if (wireStart) {
				wireStart = null;
				wireStartedFromSelect = false;
			} else if (circuit.activeTool !== 'select') {
				circuit.setActiveTool('select');
			}
			return;
		}

		if (trackPointerDown(e)) {
			e.preventDefault();
			return;
		}

		if (e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && spaceHeld))) {
			e.preventDefault();
			dragState = {
				kind: 'pan',
				pointerId: e.pointerId,
				pointerType: e.pointerType,
				startClientX: e.clientX,
				startClientY: e.clientY,
				startPanX: pan.x,
				startPanY: pan.y,
				moved: false
			};
			return;
		}

		if (!isPrimaryPointerDown(e)) return;

		const { gx, gy } = clientToGrid(e.clientX, e.clientY);
		const snappedPin = findNearestPin(gx, gy, getPinSnapDist(e.pointerType));
		const targetPt: GridPoint = snappedPin ?? {
			x: Math.round(gx),
			y: Math.round(gy)
		};

		if (circuit.activeTool === 'wire') {
			if (!wireStart) {
				startWireAt(targetPt, false);
			} else {
				finishWireAt(targetPt);
			}
			return;
		}

		if (circuit.activeTool === 'probe') {
			const nid = findNodeNearGrid(gx, gy, getNodeProbeDist(e.pointerType));
			pinnedProbeNodeId = nid;
			return;
		}

		if (isPlacementTool(circuit.activeTool)) {
			const gxSnap = Math.round(gx);
			const gySnap = Math.round(gy);
			circuit.addComponent(circuit.activeTool, gxSnap, gySnap, {
				rotation: circuit.placementRotation,
				sourceMode: circuit.activeSourceMode
			});
			return;
		}

		// Select tool: background drag pans; background tap clears selection
		if (wireStart) {
			finishWireAt(targetPt);
			return;
		}

		dragState = {
			kind: 'pan',
			pointerId: e.pointerId,
			pointerType: e.pointerType,
			startClientX: e.clientX,
			startClientY: e.clientY,
			startPanX: pan.x,
			startPanY: pan.y,
			moved: false
		};
	}

	function handleComponentPointerDown(e: PointerEvent, comp: CircuitComponent): void {
		if (e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && spaceHeld))) {
			// Let middle-click / Space+drag pan cleanly
			return;
		}
		if (!isPrimaryPointerDown(e)) return;

		if (trackPointerDown(e)) {
			e.stopPropagation();
			e.preventDefault();
			return;
		}

		if (
			isPlacementTool(circuit.activeTool) ||
			circuit.activeTool === 'wire' ||
			circuit.activeTool === 'probe' ||
			wireStart
		) {
			return;
		}

		e.stopPropagation();
		circuit.selectComponent(comp.id);

		const { gx, gy } = clientToGrid(e.clientX, e.clientY);
		dragState = {
			kind: 'component',
			pointerId: e.pointerId,
			pointerType: e.pointerType,
			componentId: comp.id,
			offsetGx: gx - comp.x,
			offsetGy: gy - comp.y,
			origGx: comp.x,
			origGy: comp.y,
			snapshotRecorded: false
		};
	}

	function handlePinPointerDown(
		e: PointerEvent,
		comp: CircuitComponent,
		pinX: number,
		pinY: number
	): void {
		if (!isPrimaryPointerDown(e) || spaceHeld) return;

		if (trackPointerDown(e)) {
			e.stopPropagation();
			e.preventDefault();
			return;
		}

		if (isPlacementTool(circuit.activeTool)) return;

		// In Select mode (when not actively routing a wire), allow taps near the component body
		// to fall through to component selection/dragging even when zoomed out with large touch hitboxes.
		if (circuit.activeTool === 'select' && !wireStart) {
			const { gx, gy } = clientToGrid(e.clientX, e.clientY);
			const distToPin = Math.hypot(gx - pinX, gy - pinY);
			const isOnePinComp = comp.kind === 'ground' || comp.kind === 'terminal';
			if (isOnePinComp) {
				if (distToPin > 0.45) return;
			} else {
				const distToCenter = Math.hypot(gx - comp.x, gy - comp.y);
				if (distToCenter < distToPin && distToCenter <= 1.25) return;
			}
		}

		e.stopPropagation();
		const pt = { x: pinX, y: pinY };

		if (circuit.activeTool === 'probe') {
			pinnedProbeNodeId = findNodeNearGrid(pinX, pinY, getNodeProbeDist(e.pointerType));
			return;
		}

		if (!wireStart) {
			startWireAt(pt, circuit.activeTool === 'select');
		} else {
			finishWireAt(pt);
		}
	}

	function handleWirePointerDown(e: PointerEvent, wire: CircuitWire): void {
		if (!isPrimaryPointerDown(e) || spaceHeld) return;

		if (trackPointerDown(e)) {
			e.stopPropagation();
			e.preventDefault();
			return;
		}

		if (isPlacementTool(circuit.activeTool)) return;

		if (circuit.activeTool === 'wire' || wireStart) {
			e.stopPropagation();
			const { gx, gy } = clientToGrid(e.clientX, e.clientY);
			const pt = findNearestPin(gx, gy, getPinSnapDist(e.pointerType)) ?? {
				x: Math.round(gx),
				y: Math.round(gy)
			};
			if (!wireStart) {
				startWireAt(pt, false);
			} else {
				finishWireAt(pt);
			}
			return;
		}

		if (circuit.activeTool === 'probe') {
			e.stopPropagation();
			const { gx, gy } = clientToGrid(e.clientX, e.clientY);
			pinnedProbeNodeId = findNodeNearGrid(gx, gy, getNodeProbeDist(e.pointerType));
			return;
		}

		e.stopPropagation();
		circuit.selectWire(wire.id);
	}

	function handlePointerMove(e: PointerEvent): void {
		if (activePointers.has(e.pointerId)) {
			activePointers.set(e.pointerId, {
				clientX: e.clientX,
				clientY: e.clientY,
				pointerType: e.pointerType
			});
		}

		if (pinchState && activePointers.size >= 2 && svgEl) {
			const pts = Array.from(activePointers.values());
			const p1 = pts[0];
			const p2 = pts[1];
			const rect = svgEl.getBoundingClientRect();
			const x1 = p1.clientX - rect.left;
			const y1 = p1.clientY - rect.top;
			const x2 = p2.clientX - rect.left;
			const y2 = p2.clientY - rect.top;

			const next = computePinchTransform({
				startZoom: pinchState.startZoom,
				startMidX: pinchState.startMidX,
				startMidY: pinchState.startMidY,
				startDist: pinchState.startDist,
				currMidX: (x1 + x2) / 2,
				currMidY: (y1 + y2) / 2,
				currDist: Math.hypot(x2 - x1, y2 - y1),
				startPanX: pinchState.startPanX,
				startPanY: pinchState.startPanY,
				minZoom: 0.3,
				maxZoom: 2.5
			});
			zoom = next.zoom;
			pan = { x: next.panX, y: next.panY };
			return;
		}

		const { gx, gy } = clientToGrid(e.clientX, e.clientY);
		const gridPt = { x: snapCoord(gx), y: snapCoord(gy) };
		hoverGrid = { x: Math.round(gx), y: Math.round(gy) };
		hoverSnappedPin = findNearestPin(gx, gy, getPinSnapDist(e.pointerType));

		if (circuit.activeTool === 'probe') {
			hoveredNodeId = findNodeNearGrid(gx, gy, getNodeProbeDist(e.pointerType));
		} else if (hoveredNodeId !== null) {
			hoveredNodeId = null;
		}

		if (!dragState || dragState.pointerId !== e.pointerId) return;

		if (dragState.kind === 'pan') {
			const dx = e.clientX - dragState.startClientX;
			const dy = e.clientY - dragState.startClientY;
			const moveThreshold = dragState.pointerType === 'touch' ? 6 : 3;
			if (Math.hypot(dx, dy) > moveThreshold) {
				dragState.moved = true;
			}
			if (dragState.moved) {
				pan = {
					x: dragState.startPanX + dx,
					y: dragState.startPanY + dy
				};
			}
		} else if (dragState.kind === 'component') {
			const compId = dragState.componentId;
			const nextGx = Math.round(gx - dragState.offsetGx);
			const nextGy = Math.round(gy - dragState.offsetGy);
			const target = circuit.document.components.find((c) => c.id === compId);
			if (!target) return;
			if (target.x !== nextGx || target.y !== nextGy) {
				if (!dragState.snapshotRecorded) {
					circuit.recordSnapshot();
					dragState.snapshotRecorded = true;
				}
				circuit.moveComponent(compId, nextGx, nextGy, { recordUndo: false });
			}
			void gridPt;
		}
	}

	function handlePointerUp(e: PointerEvent): void {
		activePointers.delete(e.pointerId);

		if (pinchState) {
			if (activePointers.size < 2) {
				pinchState = null;
			}
			dragState = null;
			return;
		}

		if (dragState && dragState.pointerId === e.pointerId) {
			if (dragState.kind === 'pan' && !dragState.moved) {
				circuit.clearSelection();
			} else if (dragState.kind === 'component' && !dragState.snapshotRecorded) {
				onComponentInspect?.(dragState.componentId);
			}
			dragState = null;
		}
	}

	function handlePointerCancel(e: PointerEvent): void {
		activePointers.delete(e.pointerId);
		if (activePointers.size < 2) {
			pinchState = null;
		}
		if (dragState && dragState.pointerId === e.pointerId) {
			dragState = null;
		}
	}

	function isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName;
		return (
			tag === 'INPUT' ||
			tag === 'TEXTAREA' ||
			tag === 'SELECT' ||
			target.isContentEditable
		);
	}

	function handleKeyDown(e: KeyboardEvent): void {
		if (isTypingTarget(e.target)) return;
		if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) return;

		const key = e.key.toLowerCase();

		if ((e.ctrlKey || e.metaKey) && key === 'z') {
			e.preventDefault();
			if (e.shiftKey) {
				circuit.redo();
			} else {
				circuit.undo();
			}
			return;
		}
		if ((e.ctrlKey || e.metaKey) && key === 'y') {
			e.preventDefault();
			circuit.redo();
			return;
		}

		if (e.ctrlKey || e.metaKey || e.altKey) return;

		if (e.key === 'Escape') {
			if (wireStart) {
				wireStart = null;
				wireStartedFromSelect = false;
			} else if (circuit.activeTool !== 'select') {
				circuit.setActiveTool('select');
			} else {
				circuit.clearSelection();
				pinnedProbeNodeId = null;
			}
			return;
		}

		if ((e.code === 'Space' || e.key === 'Tab') && wireStart) {
			e.preventDefault();
			wireBendMode = wireBendMode === 'hv' ? 'vh' : 'hv';
			return;
		}

		if (e.code === 'Space') {
			spaceHeld = true;
			return;
		}

		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (circuit.selectedComponentId || circuit.selectedWireId) {
				e.preventDefault();
				circuit.deleteSelected();
			}
			return;
		}

		if (key === 'r') {
			if (e.shiftKey) {
				if (isPlacementTool(circuit.activeTool)) {
					circuit.rotatePlacement();
				} else if (circuit.selectedComponentId) {
					circuit.rotateComponent(circuit.selectedComponentId);
				} else {
					circuit.rotatePlacement();
				}
				return;
			}
			if (isPlacementTool(circuit.activeTool)) {
				circuit.rotatePlacement();
			} else if (circuit.selectedComponentId) {
				circuit.rotateComponent(circuit.selectedComponentId);
			} else {
				circuit.setActiveTool('resistor');
			}
			return;
		}

		if (e.key === ']' || e.key === '[') {
			if (isPlacementTool(circuit.activeTool)) {
				circuit.rotatePlacement();
			} else if (circuit.selectedComponentId) {
				circuit.rotateComponent(circuit.selectedComponentId);
			}
			return;
		}

		// Tool shortcuts matching PALETTE_ITEMS
		const shortcutMap: Record<string, () => void> = {
			v: () => circuit.setActiveTool('voltage_source', 'dc'),
			a: () => circuit.setActiveTool('voltage_source', 'ac'),
			i: () => circuit.setActiveTool('current_source', 'dc'),
			c: () => circuit.setActiveTool('capacitor'),
			l: () => circuit.setActiveTool('inductor'),
			w: () => circuit.setActiveTool('wire'),
			g: () => circuit.setActiveTool('ground'),
			t: () => circuit.setActiveTool('terminal'),
			p: () => circuit.setActiveTool('probe')
		};

		if (key in shortcutMap) {
			wireStart = null;
			shortcutMap[key]();
		}
	}

	function handleKeyUp(e: KeyboardEvent): void {
		if (e.code === 'Space') {
			spaceHeld = false;
		}
	}

	function pointsToSvgString(pts: GridPoint[]): string {
		return pts.map((p) => `${p.x * GRID_SIZE},${p.y * GRID_SIZE}`).join(' ');
	}

	function getSourceModeForComp(comp: CircuitComponent): 'dc' | 'ac' {
		if (circuit.document.mode === 'ac') return 'ac';
		if (/[∠@j]/i.test(comp.value) || comp.phaseDeg !== undefined) return 'ac';
		return 'dc';
	}

	function getComponentLabelLayout(comp: CircuitComponent) {
		const isVertical = comp.rotation === 90 || comp.rotation === 270;
		if (comp.kind === 'ground') {
			return {
				labelX: 16,
				labelY: 11,
				valueX: 16,
				valueY: 23,
				anchor: 'start' as const,
				showValue: false
			};
		}
		if (comp.kind === 'terminal') {
			return {
				labelX: 0,
				labelY: -14,
				valueX: 0,
				valueY: 18,
				anchor: 'middle' as const,
				showValue: false
			};
		}
		if (isVertical) {
			return {
				labelX: 21,
				labelY: -3,
				valueX: 21,
				valueY: 10,
				anchor: 'start' as const,
				showValue: true
			};
		}
		return {
			labelX: 0,
			labelY: -32,
			valueX: 0,
			valueY: -20,
			anchor: 'middle' as const,
			showValue: true
		};
	}

	interface SelRect {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	function unionRects(rects: SelRect[], pad = 0): SelRect {
		const x1 = Math.min(...rects.map((r) => r.x)) - pad;
		const y1 = Math.min(...rects.map((r) => r.y)) - pad;
		const x2 = Math.max(...rects.map((r) => r.x + r.width)) + pad;
		const y2 = Math.max(...rects.map((r) => r.y + r.height)) + pad;
		return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
	}

	// Approximate glyph advance of the 11px mono designator text drawn by the canvas.
	const DESIGNATOR_CHAR_W = 6.6;

	function getSelectionRect(comp: CircuitComponent): SelRect {
		const cx = comp.x * GRID_SIZE;
		const cy = comp.y * GRID_SIZE;
		const labelW = comp.label.length * DESIGNATOR_CHAR_W + 4;

		if (comp.kind === 'ground') {
			let glyph: SelRect;
			if (comp.rotation === 90) glyph = { x: cx - 22, y: cy - 14, width: 28, height: 28 };
			else if (comp.rotation === 180) glyph = { x: cx - 14, y: cy - 22, width: 28, height: 28 };
			else if (comp.rotation === 270) glyph = { x: cx - 6, y: cy - 14, width: 28, height: 28 };
			else glyph = { x: cx - 14, y: cy - 6, width: 28, height: 28 };
			// Upright designator: start-anchored at (+16, baseline +11), see getComponentLabelLayout
			const label: SelRect = { x: cx + 14, y: cy + 1, width: labelW + 2, height: 14 };
			return unionRects([glyph, label], 2);
		}

		if (comp.kind === 'terminal') {
			const glyph: SelRect = { x: cx - 12, y: cy - 12, width: 24, height: 24 };
			// Upright designator: middle-anchored at (0, baseline -14)
			const label: SelRect = { x: cx - labelW / 2, y: cy - 25, width: labelW, height: 14 };
			// The symbol's own terminal-name text sits at (10.5, -7) and rotates with the symbol
			const name = comp.terminalName || comp.label;
			const nameW = name.length * 5.4 + 4;
			const rad = (comp.rotation * Math.PI) / 180;
			const [px, py] = [10.5, -10.5]; // glyph-box center of that text in the symbol frame
			const ncx = px * Math.cos(rad) - py * Math.sin(rad);
			const ncy = px * Math.sin(rad) + py * Math.cos(rad);
			const rotated = comp.rotation === 90 || comp.rotation === 270;
			const nw = rotated ? 11 : nameW;
			const nh = rotated ? nameW : 11;
			const nameRect: SelRect = { x: cx + ncx - nw / 2, y: cy + ncy - nh / 2, width: nw, height: nh };
			return unionRects([glyph, label, nameRect], 2);
		}

		// Two-terminal parts: ±18 across clears the source circles (r=15 + stroke) and matches the
		// click hitbox; the long axis spans both pins.
		const isVertical = comp.rotation === 90 || comp.rotation === 270;
		return {
			x: cx - (isVertical ? 18 : 42),
			y: cy - (isVertical ? 42 : 18),
			width: isVertical ? 36 : 84,
			height: isVertical ? 84 : 36
		};
	}

	interface NodeOverlayItem {
		nodeId: string;
		xPx: number;
		yPx: number;
		anchorX: number;
		anchorY: number;
		pillWidth: number;
		text: string;
		isReference: boolean;
	}

	interface BranchOverlayItem {
		componentId: string;
		badgeX: number;
		badgeY: number;
		pillWidth: number;
		arrowX: number;
		arrowY: number;
		arrowAngleDeg: number;
		text: string;
	}

	const overlayLayout = $derived.by<{ nodes: NodeOverlayItem[]; branches: BranchOverlayItem[] }>(() => {
		if (!settings.showLiveOverlays || !circuit.solution.mna.valid) {
			return { nodes: [], branches: [] };
		}

		const theveninCompId =
			circuit.theveninTarget?.kind === 'component' ? circuit.theveninTarget.componentId : null;
		const obstacles = buildSchematicObstacles(
			circuit.document.components,
			circuit.document.wires,
			(c) => formatComponentDisplayValue(c, circuit.document.mode),
			theveninCompId
		);
		const placedPills: LayoutRect[] = [];
		const branches: BranchOverlayItem[] = [];

		for (const comp of circuit.document.components) {
			if (comp.kind === 'ground' || comp.kind === 'terminal') continue;
			const branch = circuit.solution.mna.branches[comp.id];
			if (!branch) continue;

			let displayCurrent = branch.current;
			let reversed = false;
			if (circuit.document.mode === 'dc' && branch.current.re < -1e-12) {
				displayCurrent = Complex.from(-branch.current.re, 0);
				reversed = true;
			}

			const formattedI = formatComplexOverlay(displayCurrent, 'A', circuit.document.mode, {
				precision: settings.precision,
				angleDisplay: settings.angleDisplay,
				showDcFractions: settings.showDcFractions
			});
			const pillWidth = Math.max(40, formattedI.length * 6.0 + 12);
			const pillHeight = 16;

			const arrowAngleDeg = (comp.rotation + (reversed ? 180 : 0)) % 360;
			const leadSign = reversed ? -1 : 1;
			const leadRad = (comp.rotation * Math.PI) / 180;
			const arrowX = comp.x * GRID_SIZE + Math.cos(leadRad) * 28 * leadSign;
			const arrowY = comp.y * GRID_SIZE + Math.sin(leadRad) * 28 * leadSign;

			const chosen = chooseBranchPillPosition(comp, pillWidth, pillHeight, obstacles, placedPills);
			placedPills.push(chosen.rect);

			branches.push({
				componentId: comp.id,
				badgeX: chosen.x,
				badgeY: chosen.y,
				pillWidth,
				arrowX,
				arrowY,
				arrowAngleDeg,
				text: formattedI
			});
		}

		const compCenters = new Set(circuit.document.components.map((c) => `${c.x},${c.y}`));
		const nodes: NodeOverlayItem[] = [];

		const sortedNodes = Object.values(circuit.solution.mna.nodeVoltages).sort((a, b) => {
			if (a.isReference !== b.isReference) return a.isReference ? 1 : -1;
			return a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true });
		});

		for (const node of sortedNodes) {
			if (node.gridPoints.length === 0) continue;

			let pool = node.gridPoints;
			if (node.isReference) {
				const gndComp = circuit.document.components.find((c) => c.kind === 'ground');
				if (gndComp) {
					pool = [{ x: gndComp.x, y: gndComp.y }];
				}
			}

			const formattedV = node.isReference
				? '0 V'
				: formatComplexOverlay(node.voltage, 'V', circuit.document.mode, {
						precision: settings.precision,
						angleDisplay: settings.angleDisplay,
						showDcFractions: settings.showDcFractions
					});
			const text = node.isReference ? 'GND · 0 V' : `${node.nodeId}: ${formattedV}`;
			const pillWidth = Math.max(42, text.length * 6.2 + 12);
			const pillHeight = 17;

			const chosen = chooseNodePillPosition(
				pool,
				node.isReference,
				pillWidth,
				pillHeight,
				compCenters,
				obstacles,
				placedPills
			);
			placedPills.push(chosen.rect);

			nodes.push({
				nodeId: node.nodeId,
				xPx: chosen.x,
				yPx: chosen.y,
				anchorX: chosen.anchorX,
				anchorY: chosen.anchorY,
				pillWidth,
				text,
				isReference: node.isReference
			});
		}

		return { nodes, branches };
	});

	const nodeOverlays = $derived(overlayLayout.nodes);
	const branchOverlays = $derived(overlayLayout.branches);

	const activeToolHint = $derived.by(() => {
		if (wireStart) {
			return 'Click endpoint to complete wire · Space/Tab: Flip bend · Esc: Cancel';
		}
		if (circuit.activeTool === 'wire') {
			return 'Click pin or grid point to start orthogonal wire · Esc: Select';
		}
		if (circuit.activeTool === 'probe') {
			return 'Click any node or wire to inspect voltage · Esc: Select';
		}
		if (isPlacementTool(circuit.activeTool)) {
			const name =
				PALETTE_ITEMS.find((p) => p.kind === circuit.activeTool)?.name ?? circuit.activeTool;
			return `Click grid to place ${name} · R: Rotate (${circuit.placementRotation}°) · Esc: Cancel`;
		}
		return 'Drag components · Click any pin to wire · R: Rotate · Del: Delete';
	});

	const activeToolLabel = $derived.by(() => {
		if (circuit.activeTool === 'wire') return 'Wire';
		if (circuit.activeTool === 'probe') return 'Probe';
		if (circuit.activeTool === 'voltage_source') {
			return circuit.activeSourceMode === 'ac' ? 'AC Source' : 'DC Source';
		}
		if (circuit.activeTool === 'current_source') {
			return circuit.activeSourceMode === 'ac' ? 'AC Current' : 'DC Current';
		}
		return PALETTE_ITEMS.find((p) => p.kind === circuit.activeTool)?.name ?? circuit.activeTool;
	});

	const probedNodeData = $derived.by(() => {
		const nid = hoveredNodeId ?? pinnedProbeNodeId;
		if (!nid || !circuit.solution.mna.valid) return null;
		const res = circuit.solution.mna.nodeVoltages[nid];
		if (!res) return null;
		return {
			nodeId: nid,
			formatted: res.isReference
				? '0 V'
				: formatComplexOverlay(res.voltage, 'V', circuit.document.mode, {
						precision: settings.precision,
						angleDisplay: settings.angleDisplay,
						showDcFractions: settings.showDcFractions
					})
		};
	});
</script>

<svelte:window
	onkeydown={handleKeyDown}
	onkeyup={handleKeyUp}
	onpointerup={(e) => {
		if (activePointers.has(e.pointerId)) {
			handlePointerUp(e);
		}
	}}
	onpointercancel={(e) => {
		if (activePointers.has(e.pointerId)) {
			handlePointerCancel(e);
		}
	}}
/>

<div
	bind:this={containerEl}
	bind:clientWidth={viewportW}
	bind:clientHeight={viewportH}
	class={cn(
		'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background select-none',
		className
	)}
>
	<!-- Interactive SVG Canvas -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<svg
		bind:this={svgEl}
		role="application"
		aria-label="Interactive circuit schematic editor"
		onwheel={handleWheel}
		onpointerdown={handleBackgroundPointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerCancel}
		onpointerleave={(e) => {
			if (e.pointerType === 'mouse') {
				hoverGrid = null;
				hoverSnappedPin = null;
				if (dragState && dragState.pointerId === e.pointerId) {
					handlePointerUp(e);
				}
			}
		}}
		oncontextmenu={(e) => e.preventDefault()}
		class={cn(
			'h-full w-full touch-none outline-none',
			spaceHeld || dragState?.kind === 'pan'
				? 'cursor-grab active:cursor-grabbing'
				: circuit.activeTool === 'wire' || wireStart
					? 'cursor-crosshair'
					: isPlacementTool(circuit.activeTool)
						? 'cursor-copy'
						: 'cursor-default'
		)}
	>
		<defs>
			<pattern
				id="circuit-dot-grid"
				width={GRID_SIZE * 5}
				height={GRID_SIZE * 5}
				patternUnits="userSpaceOnUse"
			>
				<!-- Minor 20px dots inside 100px cell -->
				{#each [0, 1, 2, 3, 4] as ix}
					{#each [0, 1, 2, 3, 4] as iy}
						<circle
							cx={ix * GRID_SIZE}
							cy={iy * GRID_SIZE}
							r="0.95"
							fill="var(--canvas-dot)"
						/>
					{/each}
				{/each}
				<!-- Major 100px grid hairlines -->
				<path
					d="M {GRID_SIZE * 5} 0 L 0 0 0 {GRID_SIZE * 5}"
					fill="none"
					stroke="var(--canvas-major)"
					stroke-width="1"
				/>
			</pattern>
		</defs>

		<g transform="translate({pan.x}, {pan.y}) scale({zoom})">
			<!-- World Grid Plane -->
			{#if settings.showGrid}
				<rect
					x="-10000"
					y="-10000"
					width="20000"
					height="20000"
					fill="url(#circuit-dot-grid)"
					pointer-events="none"
				/>
			{/if}

			<!-- Wires -->
			{#each circuit.document.wires as wire (wire.id)}
				{@const isSelected = circuit.selectedWireId === wire.id}
				{@const pts = pointsToSvgString(wire.points)}
				<g
					role="button"
					tabindex="-1"
					aria-label="Wire {wire.id}"
					class="cursor-pointer outline-none"
					onpointerdown={(e) => handleWirePointerDown(e, wire)}
				>
					{#if isSelected}
						<polyline
							points={pts}
							fill="none"
							stroke="var(--warning)"
							stroke-width="6"
							stroke-opacity="0.3"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					{/if}
					<polyline
						points={pts}
						fill="none"
						stroke={isSelected ? 'var(--warning)' : 'currentColor'}
						stroke-width={isSelected ? '2.5' : '2'}
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-foreground transition-colors duration-100"
					/>
					<!-- Wide transparent hit area (scales for >=28px screen touch target) -->
					<polyline
						points={pts}
						fill="none"
						stroke="transparent"
						stroke-width={wireHitStrokeWidth}
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</g>
			{/each}

			<!-- Live Orthogonal Wire Preview -->
			{#if wireStart && wirePreviewPoints.length >= 1}
				<g pointer-events="none">
					{#if wirePreviewPoints.length >= 2}
						<polyline
							points={pointsToSvgString(wirePreviewPoints)}
							fill="none"
							stroke="var(--primary)"
							stroke-width="2"
							stroke-dasharray="5 3"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					{/if}
					<circle
						cx={wireStart.x * GRID_SIZE}
						cy={wireStart.y * GRID_SIZE}
						r="4"
						fill="var(--primary)"
					/>
					{#if hoverSnappedPin || hoverGrid}
						{@const endPt = hoverSnappedPin ?? hoverGrid!}
						<circle
							cx={endPt.x * GRID_SIZE}
							cy={endPt.y * GRID_SIZE}
							r={hoverSnappedPin ? 5.5 : 3.5}
							fill={hoverSnappedPin ? 'none' : 'var(--primary)'}
							stroke="var(--primary)"
							stroke-width="2"
						/>
					{/if}
				</g>
			{/if}

			<!-- Automatic Junction Dots (3+ segments/pins meeting) -->
			<g pointer-events="none" class="text-foreground">
				{#each junctions as jpt (`${jpt.x},${jpt.y}`)}
					<circle
						cx={jpt.x * GRID_SIZE}
						cy={jpt.y * GRID_SIZE}
						r="3.5"
						fill="currentColor"
					/>
				{/each}
			</g>

			<!-- Components -->
			{#each circuit.document.components as comp (comp.id)}
				{@const isSelected = circuit.selectedComponentId === comp.id}
				{@const isThevenin =
					circuit.theveninTarget?.kind === 'component' &&
					circuit.theveninTarget.componentId === comp.id}
				{@const pins = getPinPositions(comp)}
				{@const labelLayout = getComponentLabelLayout(comp)}
				{@const displayVal = formatComponentDisplayValue(comp, circuit.document.mode)}
				{@const isVertical = comp.rotation === 90 || comp.rotation === 270}
				<g
					role="button"
					tabindex="-1"
					aria-label="{comp.label} ({comp.kind})"
					data-component-id={comp.id}
					class={cn(
						'outline-none',
						circuit.activeTool === 'select' && !wireStart
							? 'cursor-move'
							: 'cursor-pointer'
					)}
					onpointerdown={(e) => handleComponentPointerDown(e, comp)}
					ondblclick={(e) => {
						e.stopPropagation();
						circuit.rotateComponent(comp.id);
					}}
				>
					<!-- Selection Highlight Ring -->
					{#if isSelected}
						{@const selRect = getSelectionRect(comp)}
						<rect
							x={selRect.x}
							y={selRect.y}
							width={selRect.width}
							height={selRect.height}
							rx="6"
							fill="var(--warning)"
							fill-opacity="0.08"
							stroke="var(--warning)"
							stroke-width="1.5"
							stroke-dasharray="4 3"
							pointer-events="none"
						/>
					{/if}

					<!-- Invisible generous click hitbox -->
					<rect
						x={comp.x * GRID_SIZE - (isVertical ? 18 : 34)}
						y={comp.y * GRID_SIZE - (isVertical ? 34 : 18)}
						width={isVertical ? 36 : 68}
						height={isVertical ? 68 : 36}
						fill="transparent"
					/>

					<!-- Unified CircuitSymbol -->
					<g
						transform="translate({comp.x * GRID_SIZE}, {comp.y * GRID_SIZE}) rotate({comp.rotation})"
						class={cn(
							'transition-colors duration-100',
							isSelected ? 'text-warning' : 'text-foreground'
						)}
					>
						<CircuitSymbol
							kind={comp.kind}
							variant="schematic"
							asGroup={true}
							sourceMode={getSourceModeForComp(comp)}
							terminalLabel={comp.terminalName || comp.label}
						/>
					</g>

					<!-- Upright Counter-Rotated Designator & Value -->
					<g
						transform="translate({comp.x * GRID_SIZE}, {comp.y * GRID_SIZE})"
						pointer-events="none"
					>
						<text
							x={labelLayout.labelX}
							y={labelLayout.labelY}
							text-anchor={labelLayout.anchor}
							fill="var(--foreground)"
							font-family="var(--font-mono)"
							font-size="11"
							font-weight="600"
						>
							{comp.label}
						</text>
						{#if labelLayout.showValue && displayVal}
							<text
								x={labelLayout.valueX}
								y={labelLayout.valueY}
								text-anchor={labelLayout.anchor}
								fill="var(--muted-foreground)"
								font-family="var(--font-mono)"
								font-size="10"
								style="font-variant-numeric: tabular-nums;"
							>
								{displayVal}
							</text>
						{/if}
					</g>

					<!-- Thévenin Load Target Badge -->
					{#if isThevenin}
						<g
							transform="translate({comp.x * GRID_SIZE}, {comp.y * GRID_SIZE - (isVertical ? 52 : 48)})"
							pointer-events="none"
						>
							<rect
								x="-48"
								y="-9"
								width="96"
								height="17"
								rx="4"
								fill="var(--card)"
								stroke="var(--warning)"
								stroke-width="1"
							/>
							<text
								x="0"
								y="3"
								text-anchor="middle"
								fill="var(--warning)"
								font-family="var(--font-sans)"
								font-size="9.5"
								font-weight="600"
							>
								Load (Thévenin)
							</text>
						</g>
					{/if}

					<!-- Interactive Pin Circles -->
					{#each pins as pin (pin.index)}
						<g
							role="button"
							tabindex="-1"
							aria-label="{comp.label} pin {pin.name}"
							class="group/pin cursor-crosshair outline-none"
							onpointerdown={(e) => handlePinPointerDown(e, comp, pin.x, pin.y)}
						>
							<circle
								cx={pin.x * GRID_SIZE}
								cy={pin.y * GRID_SIZE}
								r={pinHitRadiusWorld}
								fill="transparent"
							/>
							<circle
								cx={pin.x * GRID_SIZE}
								cy={pin.y * GRID_SIZE}
								r="3"
								fill="var(--card)"
								stroke={hoverSnappedPin?.x === pin.x && hoverSnappedPin?.y === pin.y
									? 'var(--primary)'
									: 'var(--muted-foreground)'}
								stroke-width="1.5"
								class="opacity-70 transition-opacity duration-100 group-hover/pin:opacity-100"
							/>
						</g>
					{/each}
				</g>
			{/each}

			<!-- Ghost Placement Preview -->
			{#if isPlacementTool(circuit.activeTool) && hoverGrid}
				<g
					transform="translate({hoverGrid.x * GRID_SIZE}, {hoverGrid.y * GRID_SIZE}) rotate({circuit.placementRotation})"
					class="text-primary opacity-60"
					pointer-events="none"
				>
					<CircuitSymbol
						kind={circuit.activeTool}
						variant="schematic"
						asGroup={true}
						sourceMode={circuit.activeSourceMode}
						terminalLabel={circuit.activeTool === 'terminal' ? 'T' : undefined}
					/>
					{#if circuit.activeTool !== 'ground' && circuit.activeTool !== 'terminal'}
						<circle cx="-40" cy="0" r="3" fill="var(--primary)" />
						<circle cx="40" cy="0" r="3" fill="var(--primary)" />
					{:else}
						<circle cx="0" cy="0" r="3" fill="var(--primary)" />
					{/if}
				</g>
			{/if}

			<!-- Live Branch Current Overlays (Emerald) -->
			{#each branchOverlays as br (br.componentId)}
				<g pointer-events="none">
					<!-- Directional current arrowhead along lead -->
					<g transform="translate({br.arrowX}, {br.arrowY}) rotate({br.arrowAngleDeg})">
						<path
							d="M -4 -3.5 L 4 0 L -4 3.5 Z"
							fill="var(--current)"
						/>
					</g>
					<!-- Compact Emerald pill -->
					<g transform="translate({br.badgeX}, {br.badgeY})">
						<rect
							x={-br.pillWidth / 2}
							y="-8"
							width={br.pillWidth}
							height="16"
							rx="4"
							fill="var(--card)"
							fill-opacity="0.95"
							stroke="var(--current)"
							stroke-opacity="0.45"
							stroke-width="1"
						/>
						<text
							x="0"
							y="3"
							text-anchor="middle"
							fill="var(--current)"
							font-family="var(--font-mono)"
							font-size="9.5"
							font-weight="600"
							style="font-variant-numeric: tabular-nums;"
						>
							{br.text}
						</text>
					</g>
				</g>
			{/each}

			<!-- Live Node Voltage Overlays (Cobalt) -->
			{#each nodeOverlays as node (node.nodeId)}
				{@const distFromAnchor = Math.hypot(node.xPx - node.anchorX, node.yPx - node.anchorY)}
				<g pointer-events="none">
					{#if !node.isReference && distFromAnchor > 26}
						<line
							x1={node.anchorX}
							y1={node.anchorY}
							x2={node.xPx}
							y2={node.yPx}
							stroke="var(--voltage)"
							stroke-opacity="0.4"
							stroke-width="1"
							stroke-dasharray="2 2"
						/>
					{/if}
					<g transform="translate({node.xPx}, {node.yPx})">
						<rect
							x={-node.pillWidth / 2}
							y="-8.5"
							width={node.pillWidth}
							height="17"
							rx="8.5"
							fill="var(--card)"
							fill-opacity="0.96"
							stroke={node.isReference ? 'var(--border)' : 'var(--voltage)'}
							stroke-opacity={node.isReference ? '1' : '0.55'}
							stroke-width="1"
						/>
						<text
							x="0"
							y="3"
							text-anchor="middle"
							fill={node.isReference ? 'var(--muted-foreground)' : 'var(--voltage)'}
							font-family="var(--font-mono)"
							font-size="9.5"
							font-weight="600"
							style="font-variant-numeric: tabular-nums;"
						>
							{node.text}
						</text>
					</g>
				</g>
			{/each}
		</g>
	</svg>

	<!-- Top Telemetry Strip -->
	<div class="pointer-events-none absolute top-3 right-3 left-3 flex items-center justify-between gap-2">
		<div class="pointer-events-auto inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-card/95 px-2.5 py-1 text-[11px] shadow-2xs">
			<span class="hidden font-engineering text-muted-foreground sm:inline lg:hidden xl:inline">Grid: 20 px</span>
			<Separator orientation="vertical" class="hidden h-3 sm:block lg:hidden xl:block" />
			<span class="font-engineering text-foreground">
				Snap: {settings.snapToGrid ? 'ON' : 'OFF'}
			</span>
			<Separator orientation="vertical" class="h-3" />
			<span class="font-engineering text-voltage">
				{nodeCount} {nodeCount === 1 ? 'Node' : 'Nodes'}
			</span>
			{#if hoverGrid}
				<Separator orientation="vertical" class="hidden h-3 xl:block" />
				<span class="hidden font-engineering text-muted-foreground xl:inline">
					({hoverGrid.x}, {hoverGrid.y})
				</span>
			{/if}
		</div>

		<div class="pointer-events-auto hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-card/95 px-2.5 py-1 text-[11px] shadow-2xs sm:inline-flex">
			{#if circuit.document.components.length === 0}
				<span class="h-2 w-2 shrink-0 rounded-full bg-muted-foreground"></span>
				<span class="text-muted-foreground">Canvas empty</span>
			{:else if hasErrors}
				<span class="h-2 w-2 shrink-0 rounded-full bg-destructive"></span>
				<span class="font-medium text-destructive">Topology / Value Error</span>
			{:else if circuit.solution.mna.valid}
				<span class="h-2 w-2 shrink-0 rounded-full bg-branch-current"></span>
				<span class="text-foreground">
					Solved<span class="xl:hidden">{circuit.solution.allVerified ? ' · Verified' : ' · MNA'}</span><span class="hidden xl:inline">{' '}({circuit.solution.allVerified ? 'All methods verified' : 'MNA ready'})</span>
				</span>
			{:else}
				<span class="h-2 w-2 shrink-0 rounded-full bg-warning"></span>
				<span class="text-muted-foreground">Solver idle</span>
			{/if}
		</div>
	</div>

	<!-- On-screen Wiring Floating Pill -->
	{#if wireStart !== null}
		<div
			role="region"
			aria-label="Active wire controls"
			class="pointer-events-none absolute top-12 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center"
		>
			<div class="pointer-events-auto inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/40 bg-card/95 px-2.5 py-1 shadow-md backdrop-blur-xs">
				<span class="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
					<span class="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
					<span class="truncate">
						Wiring<span class="hidden sm:inline">{' · Tap pin/grid'}</span>
					</span>
				</span>
				<Separator orientation="vertical" class="h-4 shrink-0" />
				<Button
					variant="secondary"
					size="sm"
					class="min-h-11 shrink-0 gap-1 px-3 text-xs lg:min-h-7 lg:px-2.5"
					aria-label="Flip wire bend direction"
					onclick={() => {
						wireBendMode = wireBendMode === 'hv' ? 'vh' : 'hv';
					}}
				>
					<CornerDownRight class="size-3.5" aria-hidden="true" />
					<span>Flip Bend</span>
					<span class="font-engineering text-[10px] text-muted-foreground uppercase">
						{wireBendMode}
					</span>
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="min-h-11 shrink-0 gap-1 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive lg:min-h-7 lg:px-2.5"
					aria-label="Cancel wiring"
					onclick={() => {
						wireStart = null;
						wireStartedFromSelect = false;
					}}
				>
					<X class="size-3.5" aria-hidden="true" />
					<span>Cancel</span>
				</Button>
			</div>
		</div>
	{:else if isPlacementTool(circuit.activeTool) || circuit.activeTool === 'wire' || circuit.activeTool === 'probe'}
		<!-- On-screen Placement / Wire / Probe Mode Floating Pill -->
		<div
			role="region"
			aria-label="Active tool controls"
			class="pointer-events-none absolute top-12 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center"
		>
			<div class="pointer-events-auto inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/40 bg-card/95 px-2.5 py-1 shadow-md backdrop-blur-xs">
				<span class="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
					<span class="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
					<span class="truncate">{activeToolLabel}</span>
					{#if isPlacementTool(circuit.activeTool)}
						<span class="font-engineering text-[11px] text-muted-foreground">
							{circuit.placementRotation}°
						</span>
					{/if}
				</span>
				<Separator orientation="vertical" class="h-4 shrink-0" />
				{#if isPlacementTool(circuit.activeTool)}
					<Button
						variant="secondary"
						size="sm"
						class="min-h-11 shrink-0 gap-1 px-2.5 text-xs lg:min-h-7 lg:px-2"
						aria-label="Rotate placement 90 degrees"
						onclick={() => circuit.rotatePlacement()}
					>
						<RotateCw class="size-3.5" aria-hidden="true" />
						<span>Rotate 90°</span>
					</Button>
				{/if}
				<Button
					variant="ghost"
					size="sm"
					class="min-h-11 shrink-0 gap-1 px-3 text-xs lg:min-h-7 lg:px-2.5"
					aria-label="Exit active tool"
					onclick={() => circuit.setActiveTool('select')}
				>
					<X class="size-3.5" aria-hidden="true" />
					<span>Done</span>
				</Button>
			</div>
		</div>
	{/if}

	<!-- Probe Readout Pill (when Probe tool active) -->
	{#if circuit.activeTool === 'probe' && probedNodeData}
		<div class="pointer-events-none absolute top-28 left-3 z-10 rounded-md border border-voltage/40 bg-card/95 px-3 py-1.5 shadow-sm lg:top-24">
			<div class="flex items-center gap-2 text-xs">
				<span class="text-muted-foreground">Probe Node</span>
				<Badge variant="voltage">{probedNodeData.nodeId}</Badge>
				<span class="font-engineering font-semibold text-voltage">
					{probedNodeData.formatted}
				</span>
			</div>
		</div>
	{/if}

	<!-- Onboarding Empty State -->
	{#if circuit.document.components.length === 0}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
			<div class="pointer-events-auto w-full max-w-md rounded-lg border border-border bg-card/95 p-6 shadow-sm">
				<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-rail text-primary">
					<CircuitSymbol kind="resistor" variant="icon" size={24} />
				</div>

				<h1 class="text-base font-semibold tracking-tight text-foreground">
					Place a component or load a preset to begin
				</h1>
				<p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
					Select a source, passive element, or wire tool from the palette to capture your
					schematic, or open a verified reference circuit to inspect live node voltages and
					branch currents.
				</p>

				<div class="mt-4 flex flex-wrap items-center gap-2">
					<Button variant="default" size="sm" onclick={() => onOpenPresets?.()}>
						<BookOpen />
						<span>Browse Presets</span>
					</Button>
					<Button variant="outline" size="sm" onclick={() => onOpenImport?.()}>
						<FileCode2 />
						<span>Import Netlist</span>
					</Button>
					<Button variant="ghost" size="sm" onclick={() => onOpenAiImport?.()}>
						<Sparkles />
						<span>AI Import</span>
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Selected Element Quick Action Bar (< lg) -->
	{#if (circuit.selectedComponent || circuit.selectedWire) && !wireStart && !isPlacementTool(circuit.activeTool)}
		<div
			role="toolbar"
			aria-label="Selected element actions"
			class="pointer-events-none absolute right-2 bottom-[68px] left-2 z-20 flex justify-center lg:hidden"
		>
			<div class="no-scrollbar pointer-events-auto inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-warning/50 bg-card/95 px-2 py-1 shadow-lg backdrop-blur-xs">
				{#if circuit.selectedComponent}
					{@const selectedComp = circuit.selectedComponent}
					{@const isTwoTerminal = selectedComp.kind !== 'ground' && selectedComp.kind !== 'terminal'}
					{@const isTheveninActive =
						circuit.theveninTarget?.kind === 'component' &&
						circuit.theveninTarget.componentId === selectedComp.id}
					<Badge variant="warning" class="font-engineering shrink-0 px-1.5 py-0.5 text-xs">
						{selectedComp.label}
					</Badge>
					<Button
						variant="ghost"
						size="sm"
						class="min-h-11 shrink-0 gap-1 px-2.5 text-xs"
						aria-label="Rotate component 90 degrees"
						onclick={() => circuit.rotateComponent(selectedComp.id)}
					>
						<RotateCw class="size-3.5" aria-hidden="true" />
						<span>Rotate</span>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="min-h-11 shrink-0 gap-1 px-2.5 text-xs"
						aria-label="Inspect component properties"
						onclick={() => onMobileInspect?.(selectedComp.id)}
					>
						<SlidersHorizontal class="size-3.5" aria-hidden="true" />
						<span>Edit</span>
					</Button>
					{#if isTwoTerminal}
						<Button
							variant={isTheveninActive ? 'secondary' : 'ghost'}
							size="sm"
							class={cn(
								'min-h-11 shrink-0 gap-1 px-2.5 text-xs',
								isTheveninActive && 'border border-warning/50 bg-warning/15 text-warning'
							)}
							aria-label={isTheveninActive
								? 'Clear Thévenin load target'
								: 'Set as Thévenin load target'}
							aria-pressed={isTheveninActive}
							onclick={() => {
								if (isTheveninActive) {
									circuit.clearTheveninTarget();
								} else {
									circuit.setTheveninComponent(selectedComp.id);
								}
							}}
						>
							<Target class="size-3.5" aria-hidden="true" />
							<span>Thév</span>
						</Button>
					{/if}
					<Button
						variant="ghost"
						size="icon"
						class="min-h-11 min-w-11 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
						aria-label="Delete component"
						onclick={() => circuit.deleteComponent(selectedComp.id)}
					>
						<Trash2 class="size-4" aria-hidden="true" />
					</Button>
				{:else if circuit.selectedWire}
					{@const selectedWire = circuit.selectedWire}
					<Badge variant="warning" class="font-engineering shrink-0 px-1.5 py-0.5 text-xs">
						{selectedWire.id}
					</Badge>
					<Button
						variant="ghost"
						size="sm"
						class="min-h-11 shrink-0 gap-1 px-2.5 text-xs"
						aria-label="Inspect wire properties"
						onclick={() => onMobileInspect?.()}
					>
						<SlidersHorizontal class="size-3.5" aria-hidden="true" />
						<span>Inspect</span>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="min-h-11 shrink-0 gap-1 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
						aria-label="Delete wire"
						onclick={() => circuit.deleteWire(selectedWire.id)}
					>
						<Trash2 class="size-3.5" aria-hidden="true" />
						<span>Delete</span>
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Mobile & Tablet Floating Canvas Controls (< lg) -->
	<div class="pointer-events-none absolute right-2 bottom-3 left-2 z-20 flex items-center justify-between gap-2 lg:hidden">
		<div class="pointer-events-auto inline-flex items-center rounded-lg border border-border bg-card/95 p-0.5 shadow-md backdrop-blur-xs">
			<Button
				variant="ghost"
				size="icon"
				class="h-11 w-11"
				aria-label="Zoom out"
				onclick={() => adjustZoom(-0.15)}
			>
				<Minus class="size-4" aria-hidden="true" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-11 w-11"
				aria-label="Fit to view"
				onclick={fitToView}
			>
				<Scan class="size-4" aria-hidden="true" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-11 w-11"
				aria-label="Zoom in"
				onclick={() => adjustZoom(0.15)}
			>
				<Plus class="size-4" aria-hidden="true" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-11 w-11"
				aria-label="Undo"
				disabled={!circuit.canUndo}
				onclick={() => circuit.undo()}
			>
				<Undo2 class="size-4" aria-hidden="true" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-11 w-11"
				aria-label="Redo"
				disabled={!circuit.canRedo}
				onclick={() => circuit.redo()}
			>
				<Redo2 class="size-4" aria-hidden="true" />
			</Button>
		</div>

		<Button
			variant="default"
			onclick={() => onOpenPalette?.()}
			aria-label="Open component palette"
			class="pointer-events-auto min-h-11 shrink-0 gap-1.5 rounded-lg px-3 text-sm shadow-md"
		>
			<Plus class="size-4" aria-hidden="true" />
			<span>Parts</span>
		</Button>
	</div>

	<!-- Desktop Bottom Controls & Contextual Hint (lg+) -->
	<div class="pointer-events-none absolute right-3 bottom-3 left-3 hidden flex-wrap items-center justify-between gap-2 lg:flex">
		<div class="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-border bg-card/95 p-1 shadow-2xs">
			<Tooltip content="Zoom out" side="top">
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					aria-label="Zoom out"
					onclick={() => adjustZoom(-0.15)}
				>
					<Minus class="size-3.5" />
				</Button>
			</Tooltip>
			<button
				type="button"
				onclick={resetZoom}
				title="Reset zoom to 100%"
				class="min-w-11 cursor-pointer rounded px-1 py-0.5 text-center font-engineering text-[11px] text-foreground hover:bg-accent"
			>
				{Math.round(zoom * 100)}%
			</button>
			<Tooltip content="Zoom in" side="top">
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					aria-label="Zoom in"
					onclick={() => adjustZoom(0.15)}
				>
					<Plus class="size-3.5" />
				</Button>
			</Tooltip>

			<Separator orientation="vertical" class="mx-0.5 h-4" />

			<Tooltip content="Reset to 100%" side="top">
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					aria-label="Reset zoom"
					onclick={resetZoom}
				>
					<RotateCcw class="size-3.5" />
				</Button>
			</Tooltip>
			<Tooltip content="Fit schematic to view" side="top">
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					aria-label="Fit to view"
					onclick={fitToView}
				>
					<Scan class="size-3.5" />
				</Button>
			</Tooltip>

			<Separator orientation="vertical" class="mx-0.5 h-4" />

			<Tooltip content="Undo (Ctrl+Z)" side="top">
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					aria-label="Undo"
					disabled={!circuit.canUndo}
					onclick={() => circuit.undo()}
				>
					<Undo2 class="size-3.5" />
				</Button>
			</Tooltip>
			<Tooltip content="Redo (Ctrl+Shift+Z)" side="top">
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					aria-label="Redo"
					disabled={!circuit.canRedo}
					onclick={() => circuit.redo()}
				>
					<Redo2 class="size-3.5" />
				</Button>
			</Tooltip>
			<Tooltip content="Clear canvas" side="top">
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6 text-destructive hover:text-destructive"
					aria-label="Clear canvas"
					disabled={circuit.document.components.length === 0 && circuit.document.wires.length === 0}
					onclick={() => circuit.clearCircuit()}
				>
					<Eraser class="size-3.5" />
				</Button>
			</Tooltip>
		</div>

		<div class="hidden rounded-md border border-border bg-card/95 px-2.5 py-1 text-[11px] text-muted-foreground shadow-2xs md:block">
			{activeToolHint}
		</div>
	</div>
</div>
