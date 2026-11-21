<script lang="ts">
	import { RotateCcw } from 'lucide-svelte';
	import { CircuitSymbol } from '$lib/components/symbols';
	import { Button, Dialog, Label, Separator, Switch } from '$lib/components/ui';
	import {
		settings,
		type AcMagnitudeMode,
		type AngleDisplay,
		type DisplayPrecision,
		type SchematicStandard
	} from '$lib/stores/settings.svelte';
	import { cn } from '$lib/utils';

	type Props = {
		open?: boolean;
	};

	let { open = $bindable(false) }: Props = $props();

	const SYMBOL_OPTIONS: Array<{ value: SchematicStandard; title: string; subtitle: string }> = [
		{ value: 'ieee', title: 'IEEE / ANSI', subtitle: 'Zigzag resistor (Default)' },
		{ value: 'iec', title: 'IEC 60617', subtitle: 'Rectangular resistor' }
	];

	const ANGLE_OPTIONS: Array<{ value: AngleDisplay; label: string; example: string }> = [
		{ value: 'polar', label: 'Polar', example: '12.4∠-36.9° V' },
		{ value: 'rectangular', label: 'Rectangular', example: '9.92 - j7.45 V' },
		{ value: 'both', label: 'Both', example: 'Polar + Rect' }
	];

	const PRECISION_OPTIONS: DisplayPrecision[] = [2, 3, 4];

	const AC_MAG_OPTIONS: Array<{ value: AcMagnitudeMode; label: string; detail: string }> = [
		{ value: 'rms', label: 'RMS', detail: 'Effective value (Default)' },
		{ value: 'peak', label: 'Peak', detail: 'Amplitude V_m / I_m' }
	];
</script>

<Dialog
	bind:open
	title="Preferences &amp; Engineering Standards"
	description="Configure schematic symbols, phasor notation, numerical precision, and canvas overlays."
	class="max-w-xl"
>
	<div class="flex flex-col gap-5">
		<!-- Schematic Symbol Standard -->
		<section class="flex flex-col gap-2">
			<Label>Schematic Symbol Standard</Label>
			<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
				{#each SYMBOL_OPTIONS as opt (opt.value)}
					{@const active = settings.schematicStandard === opt.value}
					<button
						type="button"
						onclick={() => (settings.schematicStandard = opt.value)}
						aria-pressed={active}
						class={cn(
							'flex cursor-pointer items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors duration-150',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							active
								? 'border-primary bg-primary/10'
								: 'border-border bg-surface-rail/40 hover:bg-muted'
						)}
					>
						<div class="flex flex-col gap-0.5">
							<span class="text-xs font-semibold text-foreground">{opt.title}</span>
							<span class="text-[11px] text-muted-foreground">{opt.subtitle}</span>
						</div>
						<div class="shrink-0 rounded-sm border border-border bg-card px-2 py-1 text-foreground">
							<CircuitSymbol
								kind="resistor"
								variant="schematic"
								standard={opt.value}
								class="h-6 w-14"
							/>
						</div>
					</button>
				{/each}
			</div>
		</section>

		<Separator />

		<!-- Complex Number Display (AC) -->
		<section class="flex flex-col gap-2">
			<Label>Complex Number Display (AC)</Label>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
				{#each ANGLE_OPTIONS as opt (opt.value)}
					{@const active = settings.angleDisplay === opt.value}
					<button
						type="button"
						onclick={() => (settings.angleDisplay = opt.value)}
						aria-pressed={active}
						class={cn(
							'flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors duration-150',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							active
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-border bg-surface-rail/40 text-muted-foreground hover:bg-muted hover:text-foreground'
						)}
					>
						<span class="text-xs font-semibold text-foreground">{opt.label}</span>
						<span class="font-engineering text-[11px] text-muted-foreground">{opt.example}</span>
					</button>
				{/each}
			</div>
		</section>

		<!-- Decimal Precision & AC Magnitude Convention -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<section class="flex flex-col gap-2">
				<Label>Significant Digits</Label>
				<div class="grid grid-cols-3 gap-1.5">
					{#each PRECISION_OPTIONS as prec (prec)}
						{@const active = settings.precision === prec}
						<button
							type="button"
							onclick={() => (settings.precision = prec)}
							aria-pressed={active}
							class={cn(
								'font-engineering cursor-pointer rounded-md border px-2.5 py-1.5 text-center text-xs font-medium transition-colors duration-150',
								'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								active
									? 'border-primary bg-primary/10 text-primary'
									: 'border-border bg-surface-rail/40 text-foreground hover:bg-muted'
							)}
						>
							{prec} digits
						</button>
					{/each}
				</div>
			</section>

			<section class="flex flex-col gap-2">
				<Label>AC Magnitude Convention</Label>
				<div class="grid grid-cols-2 gap-1.5">
					{#each AC_MAG_OPTIONS as opt (opt.value)}
						{@const active = settings.acMagnitudeMode === opt.value}
						<button
							type="button"
							onclick={() => (settings.acMagnitudeMode = opt.value)}
							aria-pressed={active}
							title={opt.detail}
							class={cn(
								'cursor-pointer rounded-md border px-2.5 py-1.5 text-center text-xs font-medium transition-colors duration-150',
								'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								active
									? 'border-primary bg-primary/10 text-primary'
									: 'border-border bg-surface-rail/40 text-foreground hover:bg-muted'
							)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</section>
		</div>

		<Separator />

		<!-- Switches -->
		<section class="flex flex-col gap-3">
			<div class="flex items-center justify-between gap-4">
				<div class="flex flex-col gap-0.5">
					<Label for="setting-dc-fractions">Show Exact DC Fractions</Label>
					<span class="text-[11px] text-muted-foreground">
						Display rational values alongside decimals (e.g. <code class="font-engineering">10/3 V = 3.33 V</code>)
					</span>
				</div>
				<Switch
					id="setting-dc-fractions"
					checked={settings.showDcFractions}
					onCheckedChange={(v) => (settings.showDcFractions = v)}
				/>
			</div>

			<div class="flex items-center justify-between gap-4">
				<div class="flex flex-col gap-0.5">
					<Label for="setting-show-grid">Canvas Engineering Grid</Label>
					<span class="text-[11px] text-muted-foreground">
						Show 20 px dot/major grid lines on the schematic workspace
					</span>
				</div>
				<Switch
					id="setting-show-grid"
					checked={settings.showGrid}
					onCheckedChange={(v) => (settings.showGrid = v)}
				/>
			</div>

			<div class="flex items-center justify-between gap-4">
				<div class="flex flex-col gap-0.5">
					<Label for="setting-snap-grid">Snap to 20 px Grid</Label>
					<span class="text-[11px] text-muted-foreground">
						Align component pins and orthogonal wire bends to grid coordinates
					</span>
				</div>
				<Switch
					id="setting-snap-grid"
					checked={settings.snapToGrid}
					onCheckedChange={(v) => (settings.snapToGrid = v)}
				/>
			</div>

			<div class="flex items-center justify-between gap-4">
				<div class="flex flex-col gap-0.5">
					<Label for="setting-live-overlays">Live Voltage &amp; Current Overlays</Label>
					<span class="text-[11px] text-muted-foreground">
						Render solved node voltages and branch current badges directly on the schematic
					</span>
				</div>
				<Switch
					id="setting-live-overlays"
					checked={settings.showLiveOverlays}
					onCheckedChange={(v) => (settings.showLiveOverlays = v)}
				/>
			</div>
		</section>
	</div>

	{#snippet footer()}
		<div class="flex w-full items-center justify-between gap-2">
			<Button variant="ghost" size="sm" onclick={() => settings.reset()}>
				<RotateCcw class="size-3.5" aria-hidden="true" />
				Reset to Defaults
			</Button>
			<Button variant="default" size="sm" onclick={() => (open = false)}>Done</Button>
		</div>
	{/snippet}
</Dialog>
