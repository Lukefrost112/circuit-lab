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

<tbody class={cn('[&_tr:last-child]:border-0', className)} {...restProps}>
	{@render children?.()}
</tbody>
