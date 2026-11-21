<script lang="ts" module>
	import { getContext, setContext } from 'svelte';
	import type { TabsVariant } from './Tabs.svelte';

	const TABS_LIST_VARIANT_KEY = Symbol('circuit-lab-tabs-list-variant');

	export interface TabsListVariantContext {
		readonly variant: TabsVariant;
	}

	export function getTabsListVariantContext(): TabsListVariantContext | undefined {
		return getContext<TabsListVariantContext | undefined>(TABS_LIST_VARIANT_KEY);
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';
	import { getTabsContext } from './Tabs.svelte';

	type Props = {
		variant?: TabsVariant;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'class' | 'role'>;

	let { variant, class: className, children, onkeydown, ...restProps }: Props = $props();

	const tabs = getTabsContext();
	const resolvedVariant = $derived<TabsVariant>(variant ?? tabs.variant);

	setContext<TabsListVariantContext>(TABS_LIST_VARIANT_KEY, {
		get variant() {
			return resolvedVariant;
		}
	});

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

		const tabsList = Array.from(
			listEl.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')
		).filter(
			(el) =>
				el.closest('[role="tablist"]') === listEl &&
				!el.disabled &&
				el.getAttribute('aria-disabled') !== 'true'
		);

		if (tabsList.length === 0) return;

		const currentIndex = tabsList.indexOf(currentTab as HTMLButtonElement);
		let nextIndex = 0;

		if (e.key === 'ArrowRight') {
			nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % tabsList.length;
		} else if (e.key === 'ArrowLeft') {
			nextIndex =
				currentIndex === -1 ? tabsList.length - 1 : (currentIndex - 1 + tabsList.length) % tabsList.length;
		} else if (e.key === 'Home') {
			nextIndex = 0;
		} else if (e.key === 'End') {
			nextIndex = tabsList.length - 1;
		}

		e.preventDefault();
		const target = tabsList[nextIndex];
		target.focus();
		target.click();
	}
</script>

<div
	bind:this={listEl}
	role="tablist"
	onkeydown={handleKeyDown}
	class={cn(
		resolvedVariant === 'underline'
			? 'inline-flex h-9 w-full items-center gap-4 border-b border-border bg-transparent px-0 text-muted-foreground'
			: 'inline-flex h-9 items-center gap-1 rounded-md border border-border bg-surface-rail p-1 text-muted-foreground',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
