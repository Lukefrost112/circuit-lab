<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'class'>;

	let { class: className, children, ...restProps }: Props = $props();
</script>

<div class={cn('p-4', className)} {...restProps}>
	{@render children?.()}
</div>
