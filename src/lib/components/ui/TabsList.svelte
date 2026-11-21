<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'class' | 'role'>;

	let { class: className, children, onkeydown, ...restProps }: Props = $props();

	let listEl = $state<HTMLDivElement | undefined>(undefined);

	function handleKeyDown(e: KeyboardEvent & { currentTarget: EventTarget & HTMLDivElement }) {
		onkeydown?.(e);
		if (e.defaultPrevented) return;

		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') {
			return;
		}

		const currentTab = (e.target as HTMLElement | null)?.closest('[role="tab"]');
		if (!listEl || !currentTab || currentTab.closest('[role="tablist"]') !== listEl) {
			return;
		}

		const tabs = Array.from(
			listEl.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')
		).filter(
			(el) =>
				el.closest('[role="tablist"]') === listEl &&
				!el.disabled &&
				el.getAttribute('aria-disabled') !== 'true'
		);

		if (tabs.length === 0) return;

		const currentIndex = tabs.indexOf(currentTab as HTMLButtonElement);
		let nextIndex = 0;

		if (e.key === 'ArrowRight') {
			nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % tabs.length;
		} else if (e.key === 'ArrowLeft') {
			nextIndex = currentIndex === -1 ? tabs.length - 1 : (currentIndex - 1 + tabs.length) % tabs.length;
		} else if (e.key === 'Home') {
			nextIndex = 0;
		} else if (e.key === 'End') {
			nextIndex = tabs.length - 1;
		}

		e.preventDefault();
		const target = tabs[nextIndex];
		target.focus();
		target.click();
	}
</script>

<div
	bind:this={listEl}
	role="tablist"
	onkeydown={handleKeyDown}
	class={cn(
		'inline-flex h-9 items-center gap-1 rounded-md border border-border bg-surface-rail p-1 text-muted-foreground',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
