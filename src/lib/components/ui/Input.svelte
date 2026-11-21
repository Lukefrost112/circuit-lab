<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		value?: string | number;
		tabular?: boolean;
		error?: boolean;
		class?: string;
	} & Omit<HTMLInputAttributes, 'class' | 'value'>;

	let {
		value = $bindable(''),
		tabular = false,
		error = false,
		type = 'text',
		disabled = false,
		class: className,
		...restProps
	}: Props = $props();
</script>

<input
	bind:value
	{type}
	{disabled}
	aria-invalid={error ? 'true' : undefined}
	class={cn(
		'flex h-11 w-full rounded-md border border-input bg-card px-2.5 py-1 text-base text-foreground shadow-2xs transition-colors duration-150 sm:h-8 sm:text-sm lg:text-xs',
		'placeholder:text-muted-foreground/80',
		'hover:border-muted-foreground/50',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
		'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
		tabular && 'font-engineering',
		error && 'border-destructive focus-visible:ring-destructive',
		className
	)}
	{...restProps}
/>
