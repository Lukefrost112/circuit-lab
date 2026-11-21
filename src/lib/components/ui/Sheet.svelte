<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	type SheetSide = 'bottom' | 'left' | 'right';

	type Props = {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		title?: string;
		description?: string;
		side?: SheetSide;
		class?: string;
		children?: Snippet;
	};

	let {
		open = $bindable(false),
		onOpenChange,
		title,
		description,
		side = 'bottom',
		class: className,
		children
	}: Props = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const descId = `${uid}-desc`;

	let dialogEl = $state<HTMLDialogElement | undefined>(undefined);

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			dialogEl.showModal();
		} else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	function closeSheet() {
		open = false;
		onOpenChange?.(false);
	}

	function handleCancel(e: Event) {
		e.preventDefault();
		closeSheet();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (!dialogEl || e.target !== dialogEl) return;
		const rect = dialogEl.getBoundingClientRect();
		const inside =
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom;
		if (!inside) {
			closeSheet();
		}
	}

	const sideClasses = $derived.by(() => {
		if (side === 'left') {
			return 'inset-y-0 left-0 right-auto m-0 mr-auto h-dvh max-h-dvh w-[min(85vw,24rem)] max-w-none rounded-r-xl rounded-l-none border-r border-y-0 border-l-0';
		}
		if (side === 'right') {
			return 'inset-y-0 right-0 left-auto m-0 ml-auto h-dvh max-h-dvh w-[min(85vw,24rem)] max-w-none rounded-l-xl rounded-r-none border-l border-y-0 border-r-0';
		}
		return 'inset-x-0 bottom-0 top-auto m-0 mt-auto w-full max-w-none max-h-[85dvh] rounded-t-xl rounded-b-none border-t border-x border-b-0';
	});
</script>

<dialog
	bind:this={dialogEl}
	oncancel={handleCancel}
	onclick={handleBackdropClick}
	aria-labelledby={title ? titleId : undefined}
	aria-describedby={description ? descId : undefined}
	class={cn(
		'fixed border-border bg-card p-0 text-card-foreground shadow-xl',
		'backdrop:bg-slate-950/55 backdrop:backdrop-blur-[1px]',
		'open:flex open:flex-col',
		sideClasses,
		className
	)}
>
	{#if side === 'bottom'}
		<div class="flex shrink-0 justify-center pt-2 pb-0.5" aria-hidden="true">
			<span class="h-1 w-10 rounded-full bg-border"></span>
		</div>
	{/if}

	<div class="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
		<div class="flex min-w-0 flex-col gap-0.5">
			{#if title}
				<h2 id={titleId} class="truncate text-base font-semibold leading-tight tracking-tight text-foreground">
					{title}
				</h2>
			{/if}
			{#if description}
				<p id={descId} class="text-xs text-muted-foreground">
					{description}
				</p>
			{/if}
		</div>
		<button
			type="button"
			onclick={closeSheet}
			aria-label="Close sheet"
			class="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<X class="size-4" aria-hidden="true" />
		</button>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
		{@render children?.()}
	</div>
</dialog>
