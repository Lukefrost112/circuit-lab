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

	let containerEl = $state<HTMLDivElement | undefined>(undefined);
	let canScrollRight = $state(false);
	let canScrollLeft = $state(false);

	$effect(() => {
		if (!display || !containerEl) {
			canScrollRight = false;
			canScrollLeft = false;
			return;
		}
		void renderedHtml;

		const root = containerEl;
		const getScroller = (): HTMLElement =>
			root.querySelector<HTMLElement>('.katex-display') ?? root;

		const updateScrollCue = () => {
			const scroller = getScroller();
			const maxScroll = scroller.scrollWidth - scroller.clientWidth;
			canScrollRight = maxScroll > 2 && scroller.scrollLeft < maxScroll - 2;
			canScrollLeft = maxScroll > 2 && scroller.scrollLeft > 2;
		};

		const scroller = getScroller();
		updateScrollCue();
		const rafId = requestAnimationFrame(updateScrollCue);

		scroller.addEventListener('scroll', updateScrollCue, { passive: true });

		let ro: ResizeObserver | undefined;
		if (typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver(updateScrollCue);
			ro.observe(root);
			if (scroller !== root) {
				ro.observe(scroller);
			}
		}

		return () => {
			cancelAnimationFrame(rafId);
			scroller.removeEventListener('scroll', updateScrollCue);
			ro?.disconnect();
		};
	});
</script>

{#if display}
	<div
		bind:this={containerEl}
		class={cn(
			'math-block relative min-w-0 max-w-full py-0.5 text-[0.78rem] text-foreground sm:text-[0.82rem]',
			className
		)}
	>
		{@html renderedHtml}
		{#if canScrollLeft}
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-card via-card/70 to-transparent"
			></div>
		{/if}
		{#if canScrollRight}
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-card via-card/75 to-transparent"
			></div>
		{/if}
	</div>
{:else}
	<span
		class={cn(
			'math-block inline-block max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] align-middle text-[0.78rem] text-foreground sm:text-[0.82rem]',
			className
		)}
	>
		{@html renderedHtml}
	</span>
{/if}

<style>
	.math-block :global(.katex) {
		font-size: 0.92em;
	}

	@media (min-width: 640px) {
		.math-block :global(.katex) {
			font-size: 0.98em;
		}
	}

	.math-block :global(.katex-display) {
		margin: 0.25rem 0;
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
		padding-bottom: 0.25rem;
		padding-inline: 0.125rem;
		text-align: left;
	}

	.math-block :global(.katex-display > .katex) {
		display: inline-block;
		min-width: 100%;
		text-align: left;
		white-space: nowrap;
	}
</style>
