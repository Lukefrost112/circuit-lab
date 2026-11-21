<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLTdAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		tabular?: boolean;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLTdAttributes, 'class'>;

	let { tabular = false, class: className, children, ...restProps }: Props = $props();
</script>

<td
	class={cn(
		'px-2.5 py-2 align-middle text-xs text-foreground',
		tabular && 'font-engineering',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</td>
