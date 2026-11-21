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
		if (e.target === dialogEl) {
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
		'fixed inset-0 m-auto max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg rounded-lg border border-border bg-card p-0 text-card-foreground shadow-xl',
		'backdrop:bg-slate-950/55 backdrop:backdrop-blur-[1px]',
		'open:flex open:flex-col',
		className
	)}
>
	<div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
		<div class="flex flex-col gap-1">
			{#if title}
				<h2 id={titleId} class="text-base font-semibold leading-none tracking-tight">
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
			class="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<X class="size-4" />
		</button>
	</div>

	<div class="flex-1 overflow-y-auto px-5 py-4 text-sm">
		{@render children?.()}
	</div>

	{#if footer}
		<div class="flex items-center justify-end gap-2 border-t border-border bg-surface-rail/60 px-5 py-3">
			{@render footer()}
		</div>
	{/if}
</dialog>
