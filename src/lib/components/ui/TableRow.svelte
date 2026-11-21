<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLTableRowElement>, 'class'>;

	let { class: className, children, ...restProps }: Props = $props();
</script>

<tr
	class={cn(
		'border-b border-border transition-colors duration-150 hover:bg-muted/50 data-[selected=true]:bg-primary/10',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</tr>
