<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		title?: string;
		description?: string;
		header?: Snippet;
		footer?: Snippet;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'class'>;

	let {
		title,
		description,
		header,
		footer,
		class: className,
		children,
		...restProps
	}: Props = $props();
</script>

<div
	class={cn(
		'rounded-lg border border-border bg-card text-card-foreground shadow-2xs',
		className
	)}
	{...restProps}
>
	{#if header}
		<div class="border-b border-border px-4 py-3">
			{@render header()}
		</div>
	{:else if title || description}
		<div class="flex flex-col gap-1 border-b border-border px-4 py-3">
			{#if title}
				<h3 class="text-sm font-semibold leading-none tracking-tight">{title}</h3>
			{/if}
			{#if description}
				<p class="text-xs text-muted-foreground">{description}</p>
			{/if}
		</div>
	{/if}

	<div class="p-4">
		{@render children?.()}
	</div>

	{#if footer}
		<div class="border-t border-border px-4 py-3">
			{@render footer()}
		</div>
	{/if}
</div>
