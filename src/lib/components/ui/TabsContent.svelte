<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';
	import { getTabsContext } from './Tabs.svelte';

	type Props = {
		value: string;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'class' | 'role'>;

	let { value, class: className, children, ...restProps }: Props = $props();

	const tabs = getTabsContext();
	const active = $derived(tabs.value === value);
</script>

{#if active}
	<div
		role="tabpanel"
		tabindex="0"
		class={cn(
			'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</div>
{/if}
