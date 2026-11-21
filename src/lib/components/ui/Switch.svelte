<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		class?: string;
	} & Omit<HTMLButtonAttributes, 'class' | 'role' | 'aria-checked'>;

	let {
		checked = $bindable(false),
		onCheckedChange,
		disabled = false,
		class: className,
		onclick,
		...restProps
	}: Props = $props();

	function toggle(e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
		if (disabled) return;
		checked = !checked;
		onCheckedChange?.(checked);
		onclick?.(e);
	}
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	{disabled}
	onclick={toggle}
	class={cn(
		'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-150',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		'disabled:cursor-not-allowed disabled:opacity-50',
		checked ? 'bg-primary' : 'bg-slate-500/90 hover:bg-slate-500 dark:bg-slate-600 dark:hover:bg-slate-500',
		className
	)}
	{...restProps}
>
	<span
		class={cn(
			'pointer-events-none block h-4 w-4 rounded-full shadow-sm transition-transform duration-150',
			checked ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0.5 bg-white'
		)}
	></span>
</button>
