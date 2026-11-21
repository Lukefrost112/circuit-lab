<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLThAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		class?: string;
		children?: Snippet;
	} & Omit<HTMLThAttributes, 'class'>;

	let { class: className, children, ...restProps }: Props = $props();
</script>

<th
	class={cn(
		'h-8 px-2.5 text-left align-middle text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</th>
