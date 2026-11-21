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

<div class={cn('flex flex-col gap-1 border-b border-border px-4 py-3', className)} {...restProps}>
	{@render children?.()}
</div>
