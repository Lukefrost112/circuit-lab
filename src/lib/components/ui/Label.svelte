<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLLabelAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		required?: boolean;
		disabled?: boolean;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLLabelAttributes, 'class'>;

	let {
		required = false,
		disabled = false,
		class: className,
		children,
		...restProps
	}: Props = $props();
</script>

<label
	class={cn(
		'text-xs font-medium leading-none text-foreground select-none',
		disabled && 'cursor-not-allowed opacity-50',
		className
	)}
	{...restProps}
>
	{@render children?.()}
	{#if required}
		<span class="ml-0.5 text-destructive" aria-hidden="true">*</span>
	{/if}
</label>
