<script lang="ts" module>
	import { getContext, setContext } from 'svelte';

	const ACCORDION_KEY = Symbol('circuit-lab-accordion');

	export type AccordionVariant = 'bordered' | 'flush';

	export interface AccordionContext {
		readonly variant: AccordionVariant;
		isOpen: (id: string) => boolean;
		toggle: (id: string) => void;
	}

	export function getAccordionContext(): AccordionContext | undefined {
		return getContext<AccordionContext | undefined>(ACCORDION_KEY);
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		type?: 'single' | 'multiple';
		variant?: AccordionVariant;
		value?: string[];
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'class'>;

	let {
		type = 'multiple',
		variant = 'bordered',
		value = $bindable<string[]>([]),
		class: className,
		children,
		...restProps
	}: Props = $props();

	setContext<AccordionContext>(ACCORDION_KEY, {
		get variant() {
			return variant;
		},
		isOpen(id: string) {
			return value.includes(id);
		},
		toggle(id: string) {
			if (value.includes(id)) {
				value = value.filter((item) => item !== id);
			} else if (type === 'single') {
				value = [id];
			} else {
				value = [...value, id];
			}
		}
	});
</script>

<div
	class={cn(
		'divide-y divide-border',
		variant === 'bordered' && 'rounded-md border border-border bg-card',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
