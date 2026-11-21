<script lang="ts" module>
	import { getContext, setContext } from 'svelte';

	const TABS_KEY = Symbol('circuit-lab-tabs');

	export type TabsVariant = 'segmented' | 'underline';

	export interface TabsContext {
		readonly value: string;
		readonly variant: TabsVariant;
		setValue: (next: string) => void;
	}

	export function getTabsContext(): TabsContext {
		const ctx = getContext<TabsContext | undefined>(TABS_KEY);
		if (!ctx) {
			throw new Error('Tabs subcomponents must be used inside <Tabs>.');
		}
		return ctx;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		value?: string;
		variant?: TabsVariant;
		onValueChange?: (value: string) => void;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'class'>;

	let {
		value = $bindable(''),
		variant = 'segmented',
		onValueChange,
		class: className,
		children,
		...restProps
	}: Props = $props();

	setContext<TabsContext>(TABS_KEY, {
		get value() {
			return value;
		},
		get variant() {
			return variant;
		},
		setValue(next: string) {
			if (value === next) return;
			value = next;
			onValueChange?.(next);
		}
	});
</script>

<div class={cn('flex flex-col', className)} {...restProps}>
	{@render children?.()}
</div>
