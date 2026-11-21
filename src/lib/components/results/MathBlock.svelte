<script lang="ts">
	import katex from 'katex';
	import { cn } from '$lib/utils';

	type Props = {
		latex: string;
		display?: boolean;
		class?: string;
	};

	let { latex, display = true, class: className }: Props = $props();

	const renderedHtml = $derived(
		katex.renderToString(latex, {
			displayMode: display,
			throwOnError: false,
			strict: false
		})
	);
</script>

{#if display}
	<div
		class={cn(
			'max-w-full overflow-x-auto py-1 text-sm text-foreground',
			'[&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex]:text-[0.95em]',
			className
		)}
	>
		{@html renderedHtml}
	</div>
{:else}
	<span
		class={cn(
			'inline-block max-w-full overflow-x-auto align-middle text-sm text-foreground [&_.katex]:text-[0.95em]',
			className
		)}
	>
		{@html renderedHtml}
	</span>
{/if}
