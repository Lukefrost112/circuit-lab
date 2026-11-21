<script lang="ts">
	import { MousePointer2 } from 'lucide-svelte';
	import { CircuitSymbol, PALETTE_ITEMS, type PaletteItem, type SourceMode } from '$lib/components/symbols';
	import { Accordion, AccordionItem, Badge, Input } from '$lib/components/ui';
	import type { ComponentKind } from '$lib/engine';
	import { circuit, type EditorTool } from '$lib/stores/circuit.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		variant?: 'rail' | 'sheet';
		onSelectTool?: () => void;
		class?: string;
	}

	let { variant = 'rail', onSelectTool, class: className }: Props = $props();

	const isSheet = $derived(variant === 'sheet');

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

	function handleSelectMoveTool() {
		circuit.setActiveTool('select');
		onSelectTool?.();
	}

	function handleSelectPaletteItem(item: PaletteItem) {
		if (item.kind === 'wire') {
			circuit.setActiveTool('wire');
		} else if (item.kind === 'probe') {
			circuit.setActiveTool('probe');
		} else {
			circuit.setActiveTool(
				item.kind as ComponentKind,
				item.sourceMode as SourceMode | undefined
			);
		}
		onSelectTool?.();
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
	class={cn(
		isSheet
			? 'flex w-full flex-col border-r-0 bg-card'
			: 'flex w-60 shrink-0 flex-col border-r border-border bg-surface-rail',
		className
	)}
>
	<!-- Header & Filter -->
	{#if isSheet}
		<div class="sticky top-0 z-10 border-b border-border bg-card p-3">
			<Input
				type="search"
				placeholder="Filter parts..."
				bind:value={searchQuery}
				aria-label="Filter components"
				class="h-11 text-base sm:text-base"
			/>
		</div>
	{:else}
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
	{/if}

	<!-- Tool & Component List -->
	<div class={isSheet ? 'p-2 pb-4' : 'flex-1 overflow-y-auto p-2'}>
		{#if showSelectTool}
			<div class="mb-2">
				<button
					type="button"
					onclick={handleSelectMoveTool}
					class={cn(
						'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border text-left transition-colors duration-150',
						isSheet ? 'min-h-11 px-3 py-2 text-sm' : 'px-2 py-1.5 text-xs',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						circuit.activeTool === 'select'
							? 'border-warning/60 bg-warning/10 font-medium text-foreground'
							: 'border-transparent text-foreground hover:bg-accent/70'
					)}
				>
					<span class={cn('flex min-w-0 items-center', isSheet ? 'gap-2.5' : 'gap-2')}>
						<MousePointer2 class="size-4 shrink-0 text-foreground" aria-hidden="true" />
						<span class="truncate">Select / Move</span>
					</span>
					{#if !isSheet}
						<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
							Esc
						</kbd>
					{/if}
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
									'flex w-full cursor-pointer items-center justify-between rounded-md border text-left transition-colors duration-150',
									isSheet ? 'min-h-11 gap-2 px-3 py-2 text-sm' : 'gap-1.5 px-1.5 py-1.5 text-xs',
									'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									active
										? 'border-warning/60 bg-warning/10 font-medium text-foreground'
										: 'border-transparent text-foreground hover:bg-accent/70'
								)}
							>
								<span class={cn('flex min-w-0 items-center', isSheet ? 'gap-2.5' : 'gap-1.5')}>
									<CircuitSymbol
										kind={item.kind}
										variant="icon"
										sourceMode={item.sourceMode ?? 'dc'}
										size={isSheet ? 22 : 20}
										class="shrink-0 text-foreground"
									/>
									<span class="truncate">{item.name}</span>
								</span>
								{#if !isSheet}
									<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
										{item.shortcut}
									</kbd>
								{/if}
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
									'flex w-full cursor-pointer items-center justify-between rounded-md border text-left transition-colors duration-150',
									isSheet ? 'min-h-11 gap-2 px-3 py-2 text-sm' : 'gap-1.5 px-1.5 py-1.5 text-xs',
									'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									active
										? 'border-warning/60 bg-warning/10 font-medium text-foreground'
										: 'border-transparent text-foreground hover:bg-accent/70'
								)}
							>
								<span class={cn('flex min-w-0 items-center', isSheet ? 'gap-2.5' : 'gap-1.5')}>
									<CircuitSymbol
										kind={item.kind}
										variant="icon"
										size={isSheet ? 22 : 20}
										class="shrink-0 text-foreground"
									/>
									<span class="truncate">{item.name}</span>
								</span>
								{#if !isSheet}
									<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
										{item.shortcut}
									</kbd>
								{/if}
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
									'flex w-full cursor-pointer items-center justify-between rounded-md border text-left transition-colors duration-150',
									isSheet ? 'min-h-11 gap-2 px-3 py-2 text-sm' : 'gap-1.5 px-1.5 py-1.5 text-xs',
									'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									active
										? 'border-warning/60 bg-warning/10 font-medium text-foreground'
										: 'border-transparent text-foreground hover:bg-accent/70'
								)}
							>
								<span class={cn('flex min-w-0 items-center', isSheet ? 'gap-2.5' : 'gap-1.5')}>
									<CircuitSymbol
										kind={item.kind}
										variant="icon"
										size={isSheet ? 22 : 20}
										terminalLabel={item.kind === 'terminal' ? 'A' : undefined}
										class="shrink-0 text-foreground"
									/>
									<span class="truncate">{item.name}</span>
								</span>
								{#if !isSheet}
									<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
										{item.shortcut}
									</kbd>
								{/if}
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
	{#if !isSheet}
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
	{/if}
</aside>
