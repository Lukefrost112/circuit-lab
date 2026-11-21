<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLHeadingElement>, 'class'>;

	let { class: className, children, ...restProps }: Props = $props();
</script>

<h3 class={cn('text-sm font-semibold leading-none tracking-tight', className)} {...restProps}>
	{@render children?.()}
</h3>
