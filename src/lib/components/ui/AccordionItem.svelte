<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { getAccordionContext } from './Accordion.svelte';

	type Props = {
		value: string;
		title: string;
		open?: boolean;
		disabled?: boolean;
		class?: string;
		headerExtra?: Snippet;
		children?: Snippet;
	};

	let {
		value,
		title,
		open = $bindable(false),
		disabled = false,
		class: className,
		headerExtra,
		children
	}: Props = $props();

	const ctx = getAccordionContext();
	const isOpen = $derived(ctx ? ctx.isOpen(value) : open);
	const panelId = $derived(`accordion-panel-${value}`);
	const triggerId = $derived(`accordion-trigger-${value}`);

	function handleToggle() {
		if (disabled) return;
		if (ctx) {
			ctx.toggle(value);
		} else {
			open = !open;
		}
	}
</script>

<div class={cn('w-full', className)}>
	<button
		id={triggerId}
		type="button"
		aria-expanded={isOpen}
		aria-controls={panelId}
		{disabled}
		onclick={handleToggle}
		class={cn(
			'flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold text-foreground transition-colors duration-150 select-none lg:min-h-0 lg:py-2',
			'hover:bg-accent/50',
			'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
			'disabled:cursor-not-allowed disabled:opacity-50'
		)}
	>
		<span class="flex min-w-0 flex-wrap items-center gap-2 whitespace-normal text-left leading-snug">
			{title}
			{@render headerExtra?.()}
		</span>
		<ChevronDown
			class={cn(
				'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
				isOpen && 'rotate-180'
			)}
			aria-hidden="true"
		/>
	</button>

	{#if isOpen}
		<div
			id={panelId}
			role="region"
			aria-labelledby={triggerId}
			class="border-t border-border/70 px-3 py-2.5 text-xs"
		>
			{@render children?.()}
		</div>
	{/if}
</div>
