<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	type Props = {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		title?: string;
		description?: string;
		class?: string;
		footer?: Snippet;
		children?: Snippet;
	};

	let {
		open = $bindable(false),
		onOpenChange,
		title,
		description,
		class: className,
		footer,
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

	function closeDialog() {
		open = false;
		onOpenChange?.(false);
	}

	function handleCancel(e: Event) {
		e.preventDefault();
		closeDialog();
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
			closeDialog();
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	oncancel={handleCancel}
	onclick={handleBackdropClick}
	aria-labelledby={title ? titleId : undefined}
	aria-describedby={description ? descId : undefined}
	class={cn(
		'fixed inset-x-0 bottom-0 top-auto m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-xl rounded-b-none border-x border-t border-b-0 border-border bg-card p-0 text-card-foreground shadow-xl',
		'sm:inset-0 sm:m-auto sm:max-h-[85dvh] sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:rounded-lg sm:border',
		'backdrop:bg-slate-950/55 backdrop:backdrop-blur-[1px]',
		'open:flex open:flex-col',
		className
	)}
>
	<div class="flex shrink-0 justify-center pt-2 pb-0.5 sm:hidden" aria-hidden="true">
		<span class="h-1 w-10 rounded-full bg-border"></span>
	</div>

	<div class="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
		<div class="flex min-w-0 flex-col gap-1">
			{#if title}
				<h2 id={titleId} class="text-base font-semibold leading-snug tracking-tight sm:leading-none">
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
			onclick={closeDialog}
			aria-label="Close dialog"
			class="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-7 sm:w-7 sm:min-h-0 sm:min-w-0"
		>
			<X class="size-4" aria-hidden="true" />
		</button>
	</div>

	<div
		class={cn(
			'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 text-sm sm:px-5 sm:py-4',
			!footer && 'pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-4'
		)}
	>
		{@render children?.()}
	</div>

	{#if footer}
		<div
			class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-rail/60 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5"
		>
			{@render footer()}
		</div>
	{/if}
</dialog>
