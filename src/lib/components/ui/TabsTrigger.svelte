<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';
	import { getTabsContext } from './Tabs.svelte';

	type Props = {
		value: string;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLButtonAttributes, 'class' | 'role' | 'aria-selected' | 'value'>;

	let {
		value,
		disabled = false,
		class: className,
		children,
		onclick,
		...restProps
	}: Props = $props();

	const tabs = getTabsContext();
	const active = $derived(tabs.value === value);

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
		'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-medium transition-all duration-150 select-none cursor-pointer',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
		'disabled:pointer-events-none disabled:opacity-50',
		active
			? 'bg-card text-foreground shadow-2xs border border-border/80'
			: 'text-muted-foreground hover:text-foreground hover:bg-card/50 border border-transparent',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</button>
