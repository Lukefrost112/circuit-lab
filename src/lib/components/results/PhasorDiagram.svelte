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

	const CX = 150;
	const CY = 150;
	const MAX_R = 108;

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

		const entries: PhasorEntry[] = [];

		if (showVoltages && maxV > 0) {
			for (const node of rawVoltages) {
				const mag = node.voltage.abs();
				const deg = node.voltage.argDeg();
				const rad = node.voltage.argRad();
				const norm = Math.max(0.14, mag / maxV);
				const r = norm * MAX_R;
				const x2 = CX + r * Math.cos(rad);
				const y2 = CY - r * Math.sin(rad);
				const labelR = Math.min(MAX_R + 18, r + 14);
				entries.push({
					key: `V:${node.nodeId}`,
					label: `V_${node.nodeId}`,
					category: 'voltage',
					magnitude: mag,
					angleDeg: deg,
					normalizedRadius: norm,
					x2,
					y2,
					labelX: CX + labelR * Math.cos(rad),
					labelY: CY - labelR * Math.sin(rad),
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
				const norm = Math.max(0.14, mag / maxI);
				const r = norm * MAX_R;
				const x2 = CX + r * Math.cos(rad);
				const y2 = CY - r * Math.sin(rad);
				const labelR = Math.min(MAX_R + 18, r + 14);
				entries.push({
					key: `I:${branch.componentId}`,
					label: `I_${branch.label}`,
					category: 'current',
					componentId: branch.componentId,
					magnitude: mag,
					angleDeg: deg,
					normalizedRadius: norm,
					x2,
					y2,
					labelX: CX + labelR * Math.cos(rad),
					labelY: CY - labelR * Math.sin(rad),
					formatted: formatComplexValue(branch.current, 'A', 'ac', {
						precision: prec,
						angleDisplay
					}),
					formattedPolar: formatPolarQuantity(branch.current, 'A', prec)
				});
			}
		}

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

<div class={cn('flex flex-col gap-3', className)}>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-1.5">
			<button
				type="button"
				onclick={() => (showVoltages = !showVoltages)}
				aria-pressed={showVoltages}
				class={cn(
					'inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] font-medium transition-colors duration-150',
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					showVoltages
						? 'border-voltage/40 bg-voltage/10 text-voltage'
						: 'border-border bg-transparent text-muted-foreground hover:text-foreground'
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
					'inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] font-medium transition-colors duration-150',
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					showCurrents
						? 'border-branch-current/40 bg-branch-current/10 text-branch-current'
						: 'border-border bg-transparent text-muted-foreground hover:text-foreground'
				)}
			>
				<span class="size-2 rounded-full bg-branch-current" aria-hidden="true"></span>
				Currents (I)
			</button>
		</div>

		{#if activeEntry}
			<div
				class="font-engineering flex items-center gap-2 rounded-sm border border-border bg-surface-rail px-2 py-0.5 text-[11px] text-foreground"
			>
				<span
					class={cn(
						'font-semibold',
						activeEntry.category === 'voltage' ? 'text-voltage' : 'text-branch-current'
					)}
				>
					{activeEntry.label}
				</span>
				<span>{activeEntry.formatted}</span>
			</div>
		{:else}
			<span class="text-[11px] text-muted-foreground">
				Normalized independently · Hover or click phasors
			</span>
		{/if}
	</div>

	<div class="grid grid-cols-1 items-center gap-4 sm:grid-cols-[260px_1fr]">
		<div class="mx-auto w-full max-w-[260px]">
			<svg
				viewBox="0 0 300 300"
				role="img"
				aria-label="AC Polar Phasor Diagram showing voltage and current phasors"
				class="h-auto w-full rounded-md border border-border bg-background/60 select-none"
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
					x1={CX - MAX_R - 8}
					y1={CY}
					x2={CX + MAX_R + 8}
					y2={CY}
					stroke="var(--muted-foreground)"
					stroke-opacity="0.45"
					stroke-width="1"
				/>
				<line
					x1={CX}
					y1={CY - MAX_R - 8}
					x2={CX}
					y2={CY + MAX_R + 8}
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
					<text x={CX + MAX_R + 12} y={CY + 3} text-anchor="start">0°</text>
					<text x={CX} y={CY - MAX_R - 12} text-anchor="middle">90°</text>
					<text x={CX - MAX_R - 12} y={CY + 3} text-anchor="end">180°</text>
					<text x={CX} y={CY + MAX_R + 19} text-anchor="middle">-90°</text>
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
						<!-- Invisible wide hit target -->
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
						<text
							x={entry.labelX}
							y={entry.labelY}
							text-anchor="middle"
							dominant-baseline="central"
							fill={strokeColor}
							font-family="var(--font-mono)"
							font-size="9.5"
							font-weight={isHovered || isSelected ? '700' : '600'}
						>
							{entry.label}
						</text>
					</g>
				{/each}

				<circle cx={CX} cy={CY} r="2.75" fill="var(--foreground)" />
			</svg>
		</div>

		<!-- Compact interactive legend -->
		<div class="flex flex-col gap-1.5">
			{#if phasorData.entries.length === 0}
				<p class="text-xs text-muted-foreground">
					No non-zero phasors visible. Enable Voltages or Currents above.
				</p>
			{:else}
				<div class="grid max-h-[250px] grid-cols-1 gap-1 overflow-y-auto pr-1">
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
								'flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm border px-2 py-1 text-left text-xs transition-colors duration-150',
								'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								isSelected || isHovered
									? 'border-primary/40 bg-primary/10'
									: 'border-border bg-surface-rail/50 hover:bg-muted'
							)}
						>
							<span class="flex items-center gap-1.5 truncate">
								<span
									class={cn(
										'h-2 w-2 shrink-0 rounded-full',
										entry.category === 'voltage' ? 'bg-voltage' : 'bg-branch-current'
									)}
									aria-hidden="true"
								></span>
								<span class="font-engineering font-semibold text-foreground">
									{entry.label}
								</span>
							</span>
							<span class="font-engineering shrink-0 text-[11px] text-muted-foreground">
								{entry.formatted}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
