<script lang="ts" module>
	export type TableVariant = 'bordered' | 'flush';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLTableAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		variant?: TableVariant;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLTableAttributes, 'class'>;

	let { variant = 'bordered', class: className, children, ...restProps }: Props = $props();
</script>

<div
	class={cn(
		'relative w-full overflow-x-auto',
		variant === 'bordered' && 'rounded-md border border-border bg-card'
	)}
>
	<table class={cn('w-full caption-bottom text-xs', className)} {...restProps}>
		{@render children?.()}
	</table>
</div>
