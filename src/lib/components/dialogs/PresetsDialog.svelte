<script lang="ts">
	import { ArrowRight, Cpu } from 'lucide-svelte';
	import {
		Badge,
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
			onValueChange={(next) => {
				categoryFilter = next as 'all' | 'dc' | 'ac';
			}}
		>
			<TabsList class="grid h-auto w-full grid-cols-3 sm:inline-flex sm:h-9 sm:w-fit">
				<TabsTrigger value="all" class="min-h-11 sm:min-h-0">All ({PRESETS.length})</TabsTrigger>
				<TabsTrigger value="dc" class="min-h-11 sm:min-h-0">DC ({dcCount})</TabsTrigger>
				<TabsTrigger value="ac" class="min-h-11 sm:min-h-0">AC ({acCount})</TabsTrigger>
			</TabsList>
		</Tabs>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{#each filteredPresets as preset (preset.id)}
				{@const componentCount = preset.document.components.filter(
					(c) => c.kind !== 'ground' && c.kind !== 'terminal'
				).length}
				<div
					class="flex flex-col justify-between gap-3 rounded-lg border border-border bg-surface-rail/40 p-3.5 transition-colors duration-150 hover:border-primary/40 hover:bg-card"
				>
					<div class="flex flex-col gap-2">
						<div class="flex flex-wrap items-center justify-between gap-1.5">
							<div class="flex flex-wrap items-center gap-1.5">
								<Badge
									variant={preset.category === 'dc' ? 'voltage' : 'current'}
									class="uppercase"
								>
									{#if preset.category === 'ac'}
										AC · {formatFrequency(preset.document.frequencyHz)}
									{:else}
										DC
									{/if}
								</Badge>
								<Badge variant="outline">
									{METHOD_LABELS[preset.featuredMethod]}
								</Badge>
							</div>
							<span class="font-engineering flex items-center gap-1 text-[11px] text-muted-foreground">
								<Cpu class="size-3" aria-hidden="true" />
								{componentCount} elements
							</span>
						</div>

						<h3 class="text-sm font-semibold leading-snug text-foreground">
							{preset.name}
						</h3>

						<p class="text-xs leading-relaxed text-muted-foreground">
							{preset.description}
						</p>
					</div>

					<div class="flex items-center justify-end border-t border-border/70 pt-2.5">
						<Button
							variant="default"
							size="sm"
							onclick={() => handleLoad(preset)}
							class="min-h-11 w-full gap-1.5 sm:min-h-0 sm:w-auto"
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
