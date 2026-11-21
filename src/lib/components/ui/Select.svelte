<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import { ChevronDown } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	export interface SelectOption {
		value: string;
		label: string;
		disabled?: boolean;
	}

	type Props = {
		value?: string;
		options?: SelectOption[];
		error?: boolean;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLSelectAttributes, 'class' | 'value'>;

	let {
		value = $bindable(''),
		options,
		error = false,
		disabled = false,
		class: className,
		children,
		...restProps
	}: Props = $props();
</script>

<div class="relative inline-flex w-full items-center">
	<select
		bind:value
		{disabled}
		aria-invalid={error ? 'true' : undefined}
		class={cn(
			'flex h-8 w-full appearance-none rounded-md border border-input bg-card py-1 pr-7 pl-2.5 text-xs sm:text-sm text-foreground shadow-2xs transition-colors duration-150 cursor-pointer',
			'hover:border-muted-foreground/50',
			'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
			'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
			error && 'border-destructive focus-visible:ring-destructive',
			className
		)}
		{...restProps}
	>
		{#if options}
			{#each options as option (option.value)}
				<option value={option.value} disabled={option.disabled}>
					{option.label}
				</option>
			{/each}
		{:else}
			{@render children?.()}
		{/if}
	</select>
	<ChevronDown
		class="pointer-events-none absolute right-2 size-3.5 text-muted-foreground"
		aria-hidden="true"
	/>
</div>
