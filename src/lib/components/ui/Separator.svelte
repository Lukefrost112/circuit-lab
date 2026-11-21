<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		orientation?: 'horizontal' | 'vertical';
		decorative?: boolean;
		class?: string;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'class'>;

	let {
		orientation = 'horizontal',
		decorative = true,
		class: className,
		...restProps
	}: Props = $props();
</script>

<div
	role={decorative ? 'none' : 'separator'}
	aria-orientation={decorative ? undefined : orientation}
	class={cn(
		'shrink-0 bg-border',
		orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
		className
	)}
	{...restProps}
></div>
