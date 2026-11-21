<script lang="ts" module>
	import { getContext, setContext } from 'svelte';

	const TABS_KEY = Symbol('circuit-lab-tabs');

	export interface TabsContext {
		readonly value: string;
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
		onValueChange?: (value: string) => void;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'class'>;

	let {
		value = $bindable(''),
		onValueChange,
		class: className,
		children,
		...restProps
	}: Props = $props();

	setContext<TabsContext>(TABS_KEY, {
		get value() {
			return value;
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
