<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type Side = 'top' | 'bottom' | 'left' | 'right';

	type Props = {
		content?: string;
		side?: Side;
		delayMs?: number;
		class?: string;
		tooltipContent?: Snippet;
		children?: Snippet;
	};

	let {
		content,
		side = 'top',
		delayMs = 120,
		class: className,
		tooltipContent,
		children
	}: Props = $props();

	let triggerEl = $state<HTMLSpanElement | undefined>(undefined);
	let tooltipEl = $state<HTMLDivElement | undefined>(undefined);
	let visible = $state(false);
	let positioned = $state(false);
	let coords = $state({ top: 0, left: 0 });
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (!visible || !triggerEl || !tooltipEl) return;
		void content;

		const triggerRect = triggerEl.getBoundingClientRect();
		const tipRect = tooltipEl.getBoundingClientRect();
		const gap = 6;
		const pad = 8;

		let effectiveSide: Side = side;
		if (side === 'top' && triggerRect.top - gap - tipRect.height < pad) {
			if (triggerRect.bottom + gap + tipRect.height <= window.innerHeight - pad) {
				effectiveSide = 'bottom';
			}
		} else if (side === 'bottom' && triggerRect.bottom + gap + tipRect.height > window.innerHeight - pad) {
			if (triggerRect.top - gap - tipRect.height >= pad) {
				effectiveSide = 'top';
			}
		} else if (side === 'left' && triggerRect.left - gap - tipRect.width < pad) {
			if (triggerRect.right + gap + tipRect.width <= window.innerWidth - pad) {
				effectiveSide = 'right';
			}
		} else if (side === 'right' && triggerRect.right + gap + tipRect.width > window.innerWidth - pad) {
			if (triggerRect.left - gap - tipRect.width >= pad) {
				effectiveSide = 'left';
			}
		}

		let left = triggerRect.left + triggerRect.width / 2 - tipRect.width / 2;
		let top = triggerRect.top - gap - tipRect.height;

		if (effectiveSide === 'bottom') {
			top = triggerRect.bottom + gap;
		} else if (effectiveSide === 'left') {
			left = triggerRect.left - gap - tipRect.width;
			top = triggerRect.top + triggerRect.height / 2 - tipRect.height / 2;
		} else if (effectiveSide === 'right') {
			left = triggerRect.right + gap;
			top = triggerRect.top + triggerRect.height / 2 - tipRect.height / 2;
		}

		const maxLeft = Math.max(pad, window.innerWidth - tipRect.width - pad);
		const maxTop = Math.max(pad, window.innerHeight - tipRect.height - pad);
		coords = {
			left: Math.min(Math.max(pad, left), maxLeft),
			top: Math.min(Math.max(pad, top), maxTop)
		};
		positioned = true;
	});

	function show() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			positioned = false;
			visible = true;
		}, delayMs);
	}

	function hide() {
		clearTimeout(timer);
		visible = false;
		positioned = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			hide();
		}
	}

	function handleFocusIn(e: FocusEvent) {
		const target = e.target as HTMLElement | null;
		let isFocusVisible = false;
		if (target) {
			try {
				isFocusVisible = target.matches(':focus-visible');
			} catch {
				isFocusVisible = false;
			}
		}
		if (isFocusVisible) {
			show();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
	bind:this={triggerEl}
	onmouseenter={show}
	onmouseleave={hide}
	onpointerdown={hide}
	onclick={hide}
	onfocusin={handleFocusIn}
	onfocusout={hide}
	onkeydown={handleKeyDown}
	class={cn('inline-flex items-center', className)}
>
	{@render children?.()}
</span>

{#if visible && (content || tooltipContent)}
	<div
		bind:this={tooltipEl}
		role="tooltip"
		style="top: {coords.top}px; left: {coords.left}px;"
		class={cn(
			'pointer-events-none fixed z-50 w-max max-w-[260px] whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-[11px] font-medium text-popover-foreground shadow-md',
			positioned ? 'opacity-100' : 'opacity-0'
		)}
	>
		{#if tooltipContent}
			{@render tooltipContent()}
		{:else}
			{content}
		{/if}
	</div>
{/if}
