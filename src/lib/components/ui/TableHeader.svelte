<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLTableSectionElement>, 'class'>;

	let { class: className, children, ...restProps }: Props = $props();
</script>

<thead class={cn('bg-surface-rail/80 [&_tr]:border-b [&_tr]:border-border', className)} {...restProps}>
	{@render children?.()}
</thead>
