<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLTableAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		class?: string;
		children?: Snippet;
	} & Omit<HTMLTableAttributes, 'class'>;

	let { class: className, children, ...restProps }: Props = $props();
</script>

<div class="relative w-full overflow-x-auto rounded-md border border-border bg-card">
	<table class={cn('w-full caption-bottom text-xs', className)} {...restProps}>
		{@render children?.()}
	</table>
</div>
