<script lang="ts">
	import { MousePointer2 } from 'lucide-svelte';
	import { CircuitSymbol, PALETTE_ITEMS, type PaletteItem, type SourceMode } from '$lib/components/symbols';
	import { Accordion, AccordionItem, Badge, Input } from '$lib/components/ui';
	import type { ComponentKind } from '$lib/engine';
	import { circuit, type EditorTool } from '$lib/stores/circuit.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();

	let searchQuery = $state('');
	let openGroups = $state<string[]>(['sources', 'passives', 'connections']);

	const filteredItems = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return PALETTE_ITEMS;
		return PALETTE_ITEMS.filter(
			(item) =>
				item.name.toLowerCase().includes(q) ||
				item.shortcut.toLowerCase().includes(q) ||
				item.category.toLowerCase().includes(q)
		);
	});

	const sourcesList = $derived(filteredItems.filter((i) => i.category === 'sources'));
	const passivesList = $derived(filteredItems.filter((i) => i.category === 'passives'));
	const connectionsList = $derived(filteredItems.filter((i) => i.category === 'connections'));

	const showSelectTool = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return true;
		return 'select'.includes(q) || 'pointer'.includes(q) || 'esc'.includes(q);
	});

	function isItemActive(item: PaletteItem): boolean {
		if (item.kind === 'wire' || item.kind === 'probe') {
			return circuit.activeTool === item.kind;
		}
		if (item.kind === 'voltage_source' || item.kind === 'current_source') {
			return (
				circuit.activeTool === item.kind &&
				(item.sourceMode ?? 'dc') === circuit.activeSourceMode
			);
		}
		return circuit.activeTool === item.kind;
	}

	function handleSelectPaletteItem(item: PaletteItem) {
		if (item.kind === 'wire') {
			circuit.setActiveTool('wire');
			return;
		}
		if (item.kind === 'probe') {
			circuit.setActiveTool('probe');
			return;
		}
		circuit.setActiveTool(item.kind as ComponentKind, item.sourceMode as SourceMode | undefined);
	}

	const activeToolLabel = $derived.by(() => {
		const tool: EditorTool = circuit.activeTool;
		if (tool === 'select') return 'Select / Move';
		if (tool === 'wire') return 'Orthogonal Wire';
		if (tool === 'probe') return 'Node Voltage Probe';
		if (tool === 'voltage_source') {
			return circuit.activeSourceMode === 'ac' ? 'AC Voltage Source' : 'DC Voltage Source';
		}
		return PALETTE_ITEMS.find((i) => i.kind === tool)?.name ?? tool;
	});
</script>

<aside
	aria-label="Component palette"
	class={cn('flex w-60 shrink-0 flex-col border-r border-border bg-surface-rail', className)}
>
	<!-- Header & Filter -->
	<div class="flex flex-col gap-2 border-b border-border p-3">
		<div class="flex items-center justify-between">
			<span class="text-xs font-semibold tracking-tight text-foreground">
				Component Palette
			</span>
			<Badge variant="outline" class="font-engineering">
				{PALETTE_ITEMS.length + 1}
			</Badge>
		</div>
		<Input
			type="search"
			placeholder="Filter parts or key..."
			bind:value={searchQuery}
			aria-label="Filter components"
		/>
	</div>

	<!-- Tool & Component List -->
	<div class="flex-1 overflow-y-auto p-2">
		{#if showSelectTool}
			<div class="mb-2">
				<button
					type="button"
					onclick={() => circuit.setActiveTool('select')}
					class={cn(
						'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors duration-150',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						circuit.activeTool === 'select'
							? 'border-warning/60 bg-warning/10 font-medium text-foreground'
							: 'border-transparent text-foreground hover:bg-accent/70'
					)}
				>
					<span class="flex min-w-0 items-center gap-2">
						<MousePointer2 class="size-4 shrink-0 text-foreground" aria-hidden="true" />
						<span class="truncate">Select / Move</span>
					</span>
					<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
						Esc
					</kbd>
				</button>
			</div>
		{/if}

		<Accordion type="multiple" bind:value={openGroups}>
			{#if sourcesList.length > 0}
				<AccordionItem value="sources" title="Sources">
					<div class="flex flex-col gap-1">
						{#each sourcesList as item (item.id)}
							{@const active = isItemActive(item)}
							<button
								type="button"
								title={item.description}
								onclick={() => handleSelectPaletteItem(item)}
								class={cn(
									'flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border px-1.5 py-1.5 text-left text-xs transition-colors duration-150',
									'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									active
										? 'border-warning/60 bg-warning/10 font-medium text-foreground'
										: 'border-transparent text-foreground hover:bg-accent/70'
								)}
							>
								<span class="flex min-w-0 items-center gap-1.5">
									<CircuitSymbol
										kind={item.kind}
										variant="icon"
										sourceMode={item.sourceMode ?? 'dc'}
										size={20}
										class="shrink-0 text-foreground"
									/>
									<span class="truncate">{item.name}</span>
								</span>
								<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
									{item.shortcut}
								</kbd>
							</button>
						{/each}
					</div>
				</AccordionItem>
			{/if}

			{#if passivesList.length > 0}
				<AccordionItem value="passives" title="Passives">
					<div class="flex flex-col gap-1">
						{#each passivesList as item (item.id)}
							{@const active = isItemActive(item)}
							<button
								type="button"
								title={item.description}
								onclick={() => handleSelectPaletteItem(item)}
								class={cn(
									'flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border px-1.5 py-1.5 text-left text-xs transition-colors duration-150',
									'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									active
										? 'border-warning/60 bg-warning/10 font-medium text-foreground'
										: 'border-transparent text-foreground hover:bg-accent/70'
								)}
							>
								<span class="flex min-w-0 items-center gap-1.5">
									<CircuitSymbol
										kind={item.kind}
										variant="icon"
										size={20}
										class="shrink-0 text-foreground"
									/>
									<span class="truncate">{item.name}</span>
								</span>
								<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
									{item.shortcut}
								</kbd>
							</button>
						{/each}
					</div>
				</AccordionItem>
			{/if}

			{#if connectionsList.length > 0}
				<AccordionItem value="connections" title="Wiring & Ports">
					<div class="flex flex-col gap-1">
						{#each connectionsList as item (item.id)}
							{@const active = isItemActive(item)}
							<button
								type="button"
								title={item.description}
								onclick={() => handleSelectPaletteItem(item)}
								class={cn(
									'flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border px-1.5 py-1.5 text-left text-xs transition-colors duration-150',
									'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									active
										? 'border-warning/60 bg-warning/10 font-medium text-foreground'
										: 'border-transparent text-foreground hover:bg-accent/70'
								)}
							>
								<span class="flex min-w-0 items-center gap-1.5">
									<CircuitSymbol
										kind={item.kind}
										variant="icon"
										size={20}
										terminalLabel={item.kind === 'terminal' ? 'A' : undefined}
										class="shrink-0 text-foreground"
									/>
									<span class="truncate">{item.name}</span>
								</span>
								<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
									{item.shortcut}
								</kbd>
							</button>
						{/each}
					</div>
				</AccordionItem>
			{/if}
		</Accordion>

		{#if !showSelectTool && filteredItems.length === 0}
			<p class="px-2 py-4 text-center text-xs text-muted-foreground">
				No parts matching "{searchQuery}"
			</p>
		{/if}
	</div>

	<!-- Bottom Status Bar -->
	<div class="flex flex-col gap-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
		<div class="flex items-center justify-between gap-2">
			<span>Active tool</span>
			<span class="truncate font-medium text-foreground">{activeToolLabel}</span>
		</div>
		<div class="font-engineering flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground/90">
			<span class="whitespace-nowrap">R / ]: Rotate</span>
			<span aria-hidden="true">·</span>
			<span class="whitespace-nowrap">Del: Remove</span>
			<span aria-hidden="true">·</span>
			<span class="whitespace-nowrap">Esc: Select</span>
		</div>
	</div>
</aside>
