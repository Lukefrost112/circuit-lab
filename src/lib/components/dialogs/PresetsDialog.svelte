<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';
	import {
		Button,
		Dialog,
		Tabs,
		TabsList,
		TabsTrigger
	} from '$lib/components/ui';
	import { PRESETS, type CircuitPreset } from '$lib/data/presets';
	import type { MethodId } from '$lib/engine/types';
	import { AC_ENABLED } from '$lib/env';
	import { formatFrequency } from '$lib/components/results/formatters';
	import { cn } from '$lib/utils';

	type Props = {
		open?: boolean;
		onSelectPreset: (preset: CircuitPreset) => void;
	};

	let { open = $bindable(false), onSelectPreset }: Props = $props();

	let categoryFilter = $state<'all' | 'dc' | 'ac'>('all');

	const METHOD_LABELS: Record<MethodId, string> = {
		kcl_kvl: 'KCL / KVL',
		nodal: 'Nodal',
		mesh: 'Mesh',
		superposition: 'Superposition',
		source_transform: 'Source Transform',
		thevenin_norton: 'Thévenin & Norton'
	};

	const dcCount = PRESETS.filter((p) => p.category === 'dc').length;
	const acCount = PRESETS.filter((p) => p.category === 'ac').length;

	const filteredPresets = $derived(
		categoryFilter === 'all'
			? PRESETS
			: PRESETS.filter((p) => p.category === categoryFilter)
	);

	function handleLoad(preset: CircuitPreset) {
		if (!AC_ENABLED && preset.document.mode === 'ac') return;
		onSelectPreset(preset);
		open = false;
	}
</script>

<Dialog
	bind:open
	title="Circuit Presets"
	description={AC_ENABLED
		? 'Load a curated DC or AC textbook circuit to inspect, edit, and cross-verify across all 6 methods.'
		: 'Load a curated DC textbook circuit to inspect, edit, and cross-verify across all 6 methods. AC phasor presets are coming soon.'}
	class="sm:max-w-3xl"
>
	<div class="flex flex-col gap-4">
		<Tabs
			value={categoryFilter}
			variant="underline"
			onValueChange={(next) => {
				categoryFilter = next as 'all' | 'dc' | 'ac';
			}}
		>
			<TabsList class="h-auto w-full gap-4 sm:gap-5">
				<TabsTrigger value="all" class="min-h-11 px-1 sm:h-9 sm:min-h-0">All ({PRESETS.length})</TabsTrigger>
				<TabsTrigger value="dc" class="min-h-11 px-1 sm:h-9 sm:min-h-0">DC ({dcCount})</TabsTrigger>
				<TabsTrigger value="ac" class="min-h-11 px-1 sm:h-9 sm:min-h-0">AC ({acCount})</TabsTrigger>
			</TabsList>
		</Tabs>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{#each filteredPresets as preset (preset.id)}
				{@const componentCount = preset.document.components.filter(
					(c) => c.kind !== 'ground' && c.kind !== 'terminal'
				).length}
				{@const isAcDisabled = !AC_ENABLED && preset.document.mode === 'ac'}
				<div
					aria-disabled={isAcDisabled ? 'true' : undefined}
					class={cn(
						'flex flex-col justify-between gap-3 rounded-[4px] border border-border bg-background/50 p-3.5 transition-colors duration-150',
						isAcDisabled ? 'opacity-65' : 'hover:border-foreground/25 hover:bg-card'
					)}
				>
					<div class="flex flex-col gap-1.5">
						<h3 class="text-sm font-semibold leading-snug text-foreground">
							{preset.name}
						</h3>

						<p class="text-xs leading-relaxed text-muted-foreground">
							{preset.description}
						</p>
					</div>

					<div class="flex flex-col gap-2.5 border-t border-border/70 pt-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
						<div class="font-engineering flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
							<span
								class={preset.category === 'dc'
									? 'font-semibold text-voltage'
									: isAcDisabled
										? 'font-semibold text-muted-foreground'
										: 'font-semibold text-branch-current'}
							>
								{#if preset.category === 'ac'}
									AC · {formatFrequency(preset.document.frequencyHz)}
								{:else}
									DC
								{/if}
							</span>
							{#if isAcDisabled}
								<span class="rounded-[3px] border border-border bg-surface-rail px-1.5 py-0.5 font-engineering text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
									Coming Soon
								</span>
							{/if}
							<span aria-hidden="true">·</span>
							<span>{METHOD_LABELS[preset.featuredMethod]}</span>
							<span aria-hidden="true">·</span>
							<span>{componentCount} elements</span>
						</div>

						<Button
							variant="outline"
							size="sm"
							disabled={isAcDisabled}
							aria-disabled={isAcDisabled ? 'true' : undefined}
							title={isAcDisabled ? 'AC Phasor Analysis — Coming Soon' : undefined}
							onclick={() => handleLoad(preset)}
							class={cn(
								'min-h-11 w-full shrink-0 gap-1.5 sm:min-h-0 sm:w-auto',
								!isAcDisabled && 'hover:border-foreground/30 hover:bg-accent'
							)}
						>
							{#if isAcDisabled}
								Coming Soon
							{:else}
								Load Circuit
								<ArrowRight class="size-3.5" aria-hidden="true" />
							{/if}
						</Button>
					</div>
				</div>
			{/each}
		</div>
	</div>

	{#snippet footer()}
		<Button variant="outline" size="sm" onclick={() => (open = false)} class="min-h-11 sm:min-h-0">
			Close
		</Button>
	{/snippet}
</Dialog>
