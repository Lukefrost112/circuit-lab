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
	import { formatFrequency } from '$lib/components/results/formatters';

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
		onSelectPreset(preset);
		open = false;
	}
</script>

<Dialog
	bind:open
	title="Circuit Presets"
	description="Load a curated DC or AC textbook circuit to inspect, edit, and cross-verify across all 6 methods."
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
				<div
					class="flex flex-col justify-between gap-3 rounded-[4px] border border-border bg-background/50 p-3.5 transition-colors duration-150 hover:border-foreground/25 hover:bg-card"
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
						<div class="font-engineering flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
							<span
								class={preset.category === 'dc'
									? 'font-semibold text-voltage'
									: 'font-semibold text-branch-current'}
							>
								{#if preset.category === 'ac'}
									AC · {formatFrequency(preset.document.frequencyHz)}
								{:else}
									DC
								{/if}
							</span>
							<span aria-hidden="true">·</span>
							<span>{METHOD_LABELS[preset.featuredMethod]}</span>
							<span aria-hidden="true">·</span>
							<span>{componentCount} elements</span>
						</div>

						<Button
							variant="outline"
							size="sm"
							onclick={() => handleLoad(preset)}
							class="min-h-11 w-full shrink-0 gap-1.5 hover:border-foreground/30 hover:bg-accent sm:min-h-0 sm:w-auto"
						>
							Load Circuit
							<ArrowRight class="size-3.5" aria-hidden="true" />
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
