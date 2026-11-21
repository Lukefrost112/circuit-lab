<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLParagraphElement>, 'class'>;

	let { class: className, children, ...restProps }: Props = $props();
</script>

<p class={cn('text-xs text-muted-foreground', className)} {...restProps}>
	{@render children?.()}
</p>
