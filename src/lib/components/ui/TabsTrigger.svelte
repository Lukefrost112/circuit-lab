<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';
	import { getTabsContext, type TabsVariant } from './Tabs.svelte';
	import { getTabsListVariantContext } from './TabsList.svelte';

	type Props = {
		value: string;
		variant?: TabsVariant;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLButtonAttributes, 'class' | 'role' | 'aria-selected' | 'value'>;

	let {
		value,
		variant,
		disabled = false,
		class: className,
		children,
		onclick,
		...restProps
	}: Props = $props();

	const tabs = getTabsContext();
	const listVariant = getTabsListVariantContext();
	const active = $derived(tabs.value === value);
	const resolvedVariant = $derived<TabsVariant>(variant ?? listVariant?.variant ?? tabs.variant);

	function handleClick(e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
		if (disabled) return;
		tabs.setValue(value);
		onclick?.(e);
	}
</script>

<button
	type="button"
	role="tab"
	aria-selected={active}
	tabindex={active ? 0 : -1}
	{disabled}
	onclick={handleClick}
	class={cn(
		'inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-xs font-medium transition-colors duration-150 select-none cursor-pointer',
		'disabled:pointer-events-none disabled:opacity-50',
		resolvedVariant === 'underline'
			? [
					'relative -mb-px h-full border-b-2 px-1',
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
					active
						? 'border-primary text-foreground'
						: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
				]
			: [
					'rounded-sm px-2.5 py-1',
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
					active
						? 'bg-card text-foreground border border-border'
						: 'text-muted-foreground hover:text-foreground hover:bg-card/50 border border-transparent'
				],
		className
	)}
	{...restProps}
>
	{@render children?.()}
</button>
