<script lang="ts">
	import type { FullSolveResult } from '$lib/engine/types';
	import { settings } from '$lib/stores/settings.svelte';
	import { cn } from '$lib/utils';
	import { formatComplexValue, formatPolarQuantity } from './formatters';

	type Props = {
		solution: FullSolveResult;
		selectedComponentId?: string | null;
		onSelectComponent?: (id: string) => void;
		class?: string;
	};

	interface PhasorEntry {
		key: string;
		label: string;
		category: 'voltage' | 'current';
		componentId?: string;
		magnitude: number;
		angleDeg: number;
		normalizedRadius: number;
		x2: number;
		y2: number;
		labelX: number;
		labelY: number;
		formatted: string;
		formattedPolar: string;
	}

	let {
		solution,
		selectedComponentId = null,
		onSelectComponent,
		class: className
	}: Props = $props();

	let showVoltages = $state(true);
	let showCurrents = $state(true);
	let hoveredKey = $state<string | null>(null);

	const CX = 160;
	const CY = 160;
	const MAX_R = 96;
	// Arrowhead footprint used for label avoidance (marker 6 units × hovered stroke 2.75).
	const ARROW_LEN = 16;
	const ARROW_HALF_W = 6;
	// Matches the SVG's solid `bg-background` so label halos blend seamlessly into the diagram.
	const LABEL_HALO_COLOR = 'var(--background)';

	function labelBoxWidth(label: string): number {
		return label.length * 5.8 + 4;
	}
	const LABEL_BOX_H = 12;

	function normalizeDeg(deg: number): number {
		let d = deg % 360;
		if (d > 180) d -= 360;
		if (d <= -180) d += 360;
		return d;
	}

	function angleDiffDeg(a: number, b: number): number {
		return Math.abs(normalizeDeg(a - b));
	}

	interface SvgRect {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}

	function svgRectsOverlap(a: SvgRect, b: SvgRect, pad = 3): boolean {
		return !(
			a.x2 + pad <= b.x1 ||
			b.x2 + pad <= a.x1 ||
			a.y2 + pad <= b.y1 ||
			b.y2 + pad <= a.y1
		);
	}

	function segmentIntersectsRect(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		rect: SvgRect,
		pad = 2.5
	): boolean {
		const minX = rect.x1 - pad;
		const maxX = rect.x2 + pad;
		const minY = rect.y1 - pad;
		const maxY = rect.y2 + pad;
		const dx = x2 - x1;
		const dy = y2 - y1;
		let t0 = 0;
		let t1 = 1;
		const checks: Array<[number, number]> = [
			[-dx, x1 - minX],
			[dx, maxX - x1],
			[-dy, y1 - minY],
			[dy, maxY - y1]
		];
		for (const [p, q] of checks) {
			if (Math.abs(p) < 1e-9) {
				if (q < 0) return false;
			} else {
				const t = q / p;
				if (p < 0) {
					if (t > t1) return false;
					if (t > t0) t0 = t;
				} else {
					if (t < t0) return false;
					if (t < t1) t1 = t;
				}
			}
		}
		return t0 <= t1;
	}

	const phasorData = $derived.by(() => {
		const mna = solution.mna;
		const prec = settings.precision;
		const angleDisplay = settings.angleDisplay;

		const rawVoltages = Object.values(mna.nodeVoltages)
			.filter((n) => !n.isReference && n.voltage.abs() > 1e-12)
			.sort((a, b) => a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true }));

		const rawCurrents = Object.values(mna.branches)
			.filter((b) => b.current.abs() > 1e-12)
			.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

		const maxV = rawVoltages.reduce((m, n) => Math.max(m, n.voltage.abs()), 0);
		const maxI = rawCurrents.reduce((m, b) => Math.max(m, b.current.abs()), 0);

		// Pass 1: compute all visible vector geometries so label placement knows every shaft
		interface RawVectorItem {
			key: string;
			label: string;
			category: 'voltage' | 'current';
			componentId?: string;
			magnitude: number;
			angleDeg: number;
			rad: number;
			normalizedRadius: number;
			r: number;
			x2: number;
			y2: number;
			formatted: string;
			formattedPolar: string;
		}

		const rawItems: RawVectorItem[] = [];

		if (showVoltages && maxV > 0) {
			for (const node of rawVoltages) {
				const mag = node.voltage.abs();
				const deg = node.voltage.argDeg();
				const rad = node.voltage.argRad();
				const norm = Math.max(0.18, mag / maxV);
				const r = norm * MAX_R;
				rawItems.push({
					key: `V:${node.nodeId}`,
					label: `V_${node.nodeId}`,
					category: 'voltage',
					magnitude: mag,
					angleDeg: deg,
					rad,
					normalizedRadius: norm,
					r,
					x2: CX + r * Math.cos(rad),
					y2: CY - r * Math.sin(rad),
					formatted: formatComplexValue(node.voltage, 'V', 'ac', {
						precision: prec,
						angleDisplay
					}),
					formattedPolar: formatPolarQuantity(node.voltage, 'V', prec)
				});
			}
		}

		if (showCurrents && maxI > 0) {
			for (const branch of rawCurrents) {
				const mag = branch.current.abs();
				const deg = branch.current.argDeg();
				const rad = branch.current.argRad();
				const norm = Math.max(0.18, mag / maxI);
				const r = norm * MAX_R;
				rawItems.push({
					key: `I:${branch.componentId}`,
					label: `I_${branch.label}`,
					category: 'current',
					componentId: branch.componentId,
					magnitude: mag,
					angleDeg: deg,
					rad,
					normalizedRadius: norm,
					r,
					x2: CX + r * Math.cos(rad),
					y2: CY - r * Math.sin(rad),
					formatted: formatComplexValue(branch.current, 'A', 'ac', {
						precision: prec,
						angleDisplay
					}),
					formattedPolar: formatPolarQuantity(branch.current, 'A', prec)
				});
			}
		}

		const placedLabels: SvgRect[] = [
			// Axis labels (0°, 90°, 180°, -90°) + origin dot
			{ x1: CX + MAX_R + 10, y1: CY - 8, x2: CX + MAX_R + 30, y2: CY + 8 },
			{ x1: CX - 14, y1: CY - MAX_R - 24, x2: CX + 14, y2: CY - MAX_R - 6 },
			{ x1: CX - MAX_R - 36, y1: CY - 8, x2: CX - MAX_R - 10, y2: CY + 8 },
			{ x1: CX - 16, y1: CY + MAX_R + 8, x2: CX + 16, y2: CY + MAX_R + 25 },
			{ x1: CX - 8, y1: CY - 8, x2: CX + 8, y2: CY + 8 }
		];

		function placeVectorLabel(item: RawVectorItem): { lx: number; ly: number } {
			const labelW = labelBoxWidth(item.label);
			const labelH = LABEL_BOX_H;
			const nearCardinal = [0, 90, 180, -180, -90].some((c) => angleDiffDeg(item.angleDeg, c) < 14);
			const hasCollinearOther = rawItems.some(
				(other) => other.key !== item.key && angleDiffDeg(other.angleDeg, item.angleDeg) <= 6
			);

			const offsets: Array<{ dr: number; dDeg: number; bias: number }> = [
				{ dr: 16, dDeg: nearCardinal ? 14 : 0, bias: 0 },
				{ dr: 16, dDeg: -14, bias: 1 },
				{ dr: 16, dDeg: 18, bias: 2 },
				{ dr: 4, dDeg: 20, bias: 3 },
				{ dr: 4, dDeg: -20, bias: 3.5 },
				{ dr: 27, dDeg: nearCardinal ? 12 : 0, bias: 4 },
				{ dr: 14, dDeg: -24, bias: 5 },
				{ dr: 14, dDeg: 24, bias: 6 },
				{ dr: 8, dDeg: 28, bias: 7 },
				{ dr: 8, dDeg: -28, bias: 7.5 },
				{ dr: -14, dDeg: 16, bias: 8 },
				{ dr: -14, dDeg: -16, bias: 9 },
				{ dr: 30, dDeg: -16, bias: 11 },
				{ dr: 30, dDeg: 16, bias: 12 },
				{ dr: 16, dDeg: 36, bias: 14 },
				{ dr: 16, dDeg: -36, bias: 15 }
			];

			let bestX = CX + (item.r + 16) * Math.cos(item.rad);
			let bestY = CY - (item.r + 16) * Math.sin(item.rad);
			let bestScore = Infinity;

			for (const off of offsets) {
				const candR = Math.max(22, Math.min(MAX_R + 28, item.r + off.dr));
				const candRad = item.rad + (off.dDeg * Math.PI) / 180;
				const lx = CX + candR * Math.cos(candRad);
				const ly = CY - candR * Math.sin(candRad);
				const rect: SvgRect = {
					x1: lx - labelW / 2,
					y1: ly - labelH / 2,
					x2: lx + labelW / 2,
					y2: ly + labelH / 2
				};

				let score = off.bias;
				if (rect.x1 < 6 || rect.x2 > 314 || rect.y1 < 6 || rect.y2 > 314) {
					score += 5000;
				}
				for (const other of placedLabels) {
					if (svgRectsOverlap(rect, other, 3)) {
						score += 1000;
					}
				}
				if (hasCollinearOther && Math.abs(off.dDeg) < 10) {
					score += 25;
				}
				for (const seg of rawItems) {
					if (seg.key === item.key) {
						if (segmentIntersectsRect(CX, CY, seg.x2, seg.y2, rect, 1.5)) {
							score += 40;
						}
					} else if (segmentIntersectsRect(CX, CY, seg.x2, seg.y2, rect, 3)) {
						score += 180;
					}
					// Labels paint above all shafts with a solid halo, so keep them well clear of
					// other vectors' arrowheads (marker reaches ~ARROW_LEN back from the tip and is
					// ~ARROW_HALF_W wide when hovered). The own arrowhead is covered by the shaft check.
					if (seg.key !== item.key) {
						const tipBackX = seg.x2 - ARROW_LEN * Math.cos(seg.rad);
						const tipBackY = seg.y2 + ARROW_LEN * Math.sin(seg.rad);
						if (segmentIntersectsRect(tipBackX, tipBackY, seg.x2, seg.y2, rect, ARROW_HALF_W)) {
							score += 600;
						}
					}
				}
				if (score < bestScore) {
					bestScore = score;
					bestX = lx;
					bestY = ly;
				}
			}

			placedLabels.push({
				x1: bestX - labelW / 2,
				y1: bestY - labelH / 2,
				x2: bestX + labelW / 2,
				y2: bestY + labelH / 2
			});
			return { lx: bestX, ly: bestY };
		}

		// Pass 2: place labels using full knowledge of all vector shafts
		const entries: PhasorEntry[] = rawItems.map((item) => {
			const { lx, ly } = placeVectorLabel(item);
			return {
				key: item.key,
				label: item.label,
				category: item.category,
				componentId: item.componentId,
				magnitude: item.magnitude,
				angleDeg: item.angleDeg,
				normalizedRadius: item.normalizedRadius,
				x2: item.x2,
				y2: item.y2,
				labelX: lx,
				labelY: ly,
				formatted: item.formatted,
				formattedPolar: item.formattedPolar
			};
		});

		return { entries, maxV, maxI };
	});

	const activeEntry = $derived.by(() => {
		if (hoveredKey) {
			return phasorData.entries.find((e) => e.key === hoveredKey) ?? null;
		}
		if (selectedComponentId) {
			return phasorData.entries.find((e) => e.componentId === selectedComponentId) ?? null;
		}
		return null;
	});

	const uid = $props.id();
	const arrowVoltageId = `${uid}-arrow-v`;
	const arrowCurrentId = `${uid}-arrow-i`;
</script>

<div class={cn('flex min-w-0 flex-col gap-3', className)}>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex flex-wrap items-center gap-1.5">
			<button
				type="button"
				onclick={() => (showVoltages = !showVoltages)}
				aria-pressed={showVoltages}
				class={cn(
					'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[4px] border px-3 py-2 text-xs font-medium transition-colors duration-150 sm:min-h-0 sm:px-2 sm:py-1 sm:text-[11px]',
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					showVoltages
						? 'border-voltage/45 bg-voltage/10 text-voltage'
						: 'border-border bg-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground'
				)}
			>
				<span class="size-2 rounded-full bg-voltage" aria-hidden="true"></span>
				Voltages (V)
			</button>
			<button
				type="button"
				onclick={() => (showCurrents = !showCurrents)}
				aria-pressed={showCurrents}
				class={cn(
					'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[4px] border px-3 py-2 text-xs font-medium transition-colors duration-150 sm:min-h-0 sm:px-2 sm:py-1 sm:text-[11px]',
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					showCurrents
						? 'border-branch-current/45 bg-branch-current/10 text-branch-current'
						: 'border-border bg-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground'
				)}
			>
				<span class="size-2 rounded-full bg-branch-current" aria-hidden="true"></span>
				Currents (I)
			</button>
		</div>

		{#if activeEntry}
			<div
				class="font-engineering flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[4px] border border-border bg-surface-rail/60 px-2.5 py-1 text-[11px] text-foreground sm:w-auto sm:px-2 sm:py-0.5"
			>
				<span
					class={cn(
						'shrink-0 font-semibold',
						activeEntry.category === 'voltage' ? 'text-voltage' : 'text-branch-current'
					)}
				>
					{activeEntry.label}
				</span>
				<span class="min-w-0 break-words">{activeEntry.formatted}</span>
			</div>
		{:else}
			<span class="w-full text-[11px] text-muted-foreground sm:w-auto">
				Normalized independently · Tap or hover phasors
			</span>
		{/if}
	</div>

	<div class="flex flex-col gap-3">
		<div class="mx-auto w-full max-w-[300px] sm:max-w-[280px]">
			<svg
				viewBox="0 0 320 320"
				role="img"
				aria-label="AC Polar Phasor Diagram showing voltage and current phasors"
				class="h-auto w-full rounded-[4px] border border-border bg-background select-none"
			>
				<title>AC Polar Phasor Diagram</title>
				<desc>
					Concentric polar reference rings with 0, 90, 180, and -90 degree axes. Voltage phasors
					are drawn in cobalt blue and current phasors in emerald green.
				</desc>

				<defs>
					<marker
						id={arrowVoltageId}
						viewBox="0 0 10 10"
						refX="8"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--voltage)" />
					</marker>
					<marker
						id={arrowCurrentId}
						viewBox="0 0 10 10"
						refX="8"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--current)" />
					</marker>
				</defs>

				<!-- Concentric reference circles -->
				{#each [0.33, 0.66, 1] as frac (frac)}
					<circle
						cx={CX}
						cy={CY}
						r={MAX_R * frac}
						fill="none"
						stroke="var(--border)"
						stroke-width={frac === 1 ? 1.25 : 1}
						stroke-dasharray={frac === 1 ? undefined : '3 3'}
					/>
				{/each}

				<!-- Diagonal 45° / 135° axes -->
				<line
					x1={CX - MAX_R * 0.707}
					y1={CY - MAX_R * 0.707}
					x2={CX + MAX_R * 0.707}
					y2={CY + MAX_R * 0.707}
					stroke="var(--border)"
					stroke-width="0.75"
					stroke-dasharray="2 3"
				/>
				<line
					x1={CX - MAX_R * 0.707}
					y1={CY + MAX_R * 0.707}
					x2={CX + MAX_R * 0.707}
					y2={CY - MAX_R * 0.707}
					stroke="var(--border)"
					stroke-width="0.75"
					stroke-dasharray="2 3"
				/>

				<!-- Primary 0° / 90° / 180° / -90° axes -->
				<line
					x1={CX - MAX_R - 10}
					y1={CY}
					x2={CX + MAX_R + 10}
					y2={CY}
					stroke="var(--muted-foreground)"
					stroke-opacity="0.45"
					stroke-width="1"
				/>
				<line
					x1={CX}
					y1={CY - MAX_R - 10}
					x2={CX}
					y2={CY + MAX_R + 10}
					stroke="var(--muted-foreground)"
					stroke-opacity="0.45"
					stroke-width="1"
				/>

				<!-- Axis angle labels -->
				<g
					fill="var(--muted-foreground)"
					font-family="var(--font-mono)"
					font-size="10"
					font-weight="500"
				>
					<text x={CX + MAX_R + 14} y={CY + 3} text-anchor="start">0°</text>
					<text x={CX} y={CY - MAX_R - 14} text-anchor="middle">90°</text>
					<text x={CX - MAX_R - 14} y={CY + 3} text-anchor="end">180°</text>
					<text x={CX} y={CY + MAX_R + 20} text-anchor="middle">-90°</text>
				</g>

				<!-- Label hit targets: drawn beneath every shaft group so shaft hit lines always win,
				     and sized exactly like the placement boxes (which are kept 3px apart) so labels
				     never steal each other's hover. Keyboard access is on the vector groups below. -->
				<g aria-hidden="true">
					{#each phasorData.entries as entry (entry.key)}
						{@const boxW = labelBoxWidth(entry.label)}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<rect
							x={entry.labelX - boxW / 2}
							y={entry.labelY - LABEL_BOX_H / 2}
							width={boxW}
							height={LABEL_BOX_H}
							fill="transparent"
							class={entry.componentId ? 'cursor-pointer' : undefined}
							onmouseenter={() => (hoveredKey = entry.key)}
							onmouseleave={() => (hoveredKey = null)}
							onclick={() => {
								if (entry.componentId) onSelectComponent?.(entry.componentId);
							}}
						/>
					{/each}
				</g>

				<!-- Phasor vectors -->
				{#each phasorData.entries as entry (entry.key)}
					{@const isHovered = hoveredKey === entry.key}
					{@const isSelected = Boolean(entry.componentId && selectedComponentId === entry.componentId)}
					{@const isDimmed = (hoveredKey !== null && !isHovered)}
					{@const strokeColor = entry.category === 'voltage' ? 'var(--voltage)' : 'var(--current)'}
					{@const markerUrl =
						entry.category === 'voltage' ? `url(#${arrowVoltageId})` : `url(#${arrowCurrentId})`}

					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<g
						role={entry.componentId ? 'button' : undefined}
						tabindex={entry.componentId ? 0 : undefined}
						aria-label={`${entry.label}: ${entry.formattedPolar}`}
						class={cn(
							'transition-opacity duration-150',
							entry.componentId && 'cursor-pointer',
							isDimmed ? 'opacity-25' : 'opacity-100'
						)}
						onmouseenter={() => (hoveredKey = entry.key)}
						onmouseleave={() => (hoveredKey = null)}
						onfocus={() => (hoveredKey = entry.key)}
						onblur={() => (hoveredKey = null)}
						onclick={() => {
							if (entry.componentId) onSelectComponent?.(entry.componentId);
						}}
						onkeydown={(e) => {
							if (entry.componentId && (e.key === 'Enter' || e.key === ' ')) {
								e.preventDefault();
								onSelectComponent?.(entry.componentId);
							}
						}}
					>
						<!-- Invisible wide shaft hit target (label hit targets live in a layer below) -->
						<line
							x1={CX}
							y1={CY}
							x2={entry.x2}
							y2={entry.y2}
							stroke="transparent"
							stroke-width="12"
						/>
						<line
							x1={CX}
							y1={CY}
							x2={entry.x2}
							y2={entry.y2}
							stroke={strokeColor}
							stroke-width={isHovered || isSelected ? 2.75 : 1.85}
							stroke-dasharray={entry.category === 'current' ? '5 2.5' : undefined}
							marker-end={markerUrl}
						/>
					</g>
				{/each}

				<circle cx={CX} cy={CY} r="2.75" fill="var(--foreground)" />

				<!-- Phasor vector labels rendered above all shafts with a background-matched halo -->
				<g pointer-events="none">
					{#each phasorData.entries as entry (entry.key)}
						{@const isHovered = hoveredKey === entry.key}
						{@const isSelected = Boolean(entry.componentId && selectedComponentId === entry.componentId)}
						{@const isDimmed = hoveredKey !== null && !isHovered}
						{@const strokeColor = entry.category === 'voltage' ? 'var(--voltage)' : 'var(--current)'}
						<text
							x={entry.labelX}
							y={entry.labelY}
							text-anchor="middle"
							dominant-baseline="central"
							fill={strokeColor}
							style="stroke: {LABEL_HALO_COLOR};"
							stroke-width="3.5"
							stroke-linejoin="round"
							paint-order="stroke"
							font-family="var(--font-mono)"
							font-size="9.5"
							font-weight={isHovered || isSelected ? '700' : '600'}
							class={cn('transition-opacity duration-150', isDimmed ? 'opacity-25' : 'opacity-100')}
						>
							{entry.label}
						</text>
					{/each}
				</g>
			</svg>
		</div>

		<!-- Compact interactive legend -->
		<div class="flex flex-col">
			{#if phasorData.entries.length === 0}
				<p class="text-xs text-muted-foreground">
					No non-zero phasors visible. Enable Voltages or Currents above.
				</p>
			{:else}
				<div class="max-h-[250px] divide-y divide-border overflow-y-auto border-y border-border">
					{#each phasorData.entries as entry (entry.key)}
						{@const isSelected = Boolean(entry.componentId && selectedComponentId === entry.componentId)}
						{@const isHovered = hoveredKey === entry.key}
						<button
							type="button"
							onmouseenter={() => (hoveredKey = entry.key)}
							onmouseleave={() => (hoveredKey = null)}
							onclick={() => {
								if (entry.componentId) onSelectComponent?.(entry.componentId);
							}}
							class={cn(
								'flex min-h-11 w-full cursor-pointer flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-2.5 py-2 text-left text-xs transition-colors duration-150 sm:min-h-0 sm:flex-nowrap sm:py-1.5',
								'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
								isSelected || isHovered
									? 'bg-primary/10'
									: 'bg-transparent hover:bg-accent/40'
							)}
						>
							<span class="flex shrink-0 items-center gap-2">
								<span
									class={cn(
										'h-2 w-2 shrink-0 rounded-full',
										entry.category === 'voltage' ? 'bg-voltage' : 'bg-branch-current'
									)}
									aria-hidden="true"
								></span>
								<span class="font-engineering whitespace-nowrap font-semibold text-foreground">
									{entry.label}
								</span>
							</span>
							<span class="font-engineering min-w-0 max-w-full break-words text-[11px] text-muted-foreground sm:truncate sm:whitespace-nowrap">
								{entry.formatted}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
