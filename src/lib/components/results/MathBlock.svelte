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
			'min-w-0 max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] py-1 text-[0.78rem] text-foreground sm:text-[0.82rem]',
			'[&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:[-webkit-overflow-scrolling:touch] [&_.katex]:text-[0.95em]',
			className
		)}
	>
		{@html renderedHtml}
	</div>
{:else}
	<span
		class={cn(
			'inline-block max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] align-middle text-[0.78rem] text-foreground sm:text-[0.82rem] [&_.katex]:text-[0.95em]',
			className
		)}
	>
		{@html renderedHtml}
	</span>
{/if}
