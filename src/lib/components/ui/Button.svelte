<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: [
			'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium',
			'transition-colors duration-150 select-none cursor-pointer',
			'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
			'disabled:pointer-events-none disabled:opacity-50',
			'active:translate-y-px',
			'[&_svg]:pointer-events-none [&_svg]:shrink-0'
		],
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85',
				secondary:
					'bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 active:bg-secondary/70',
				outline:
					'border border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
				ghost:
					'text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
				destructive:
					'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/85'
			},
			size: {
				sm: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
				default: 'h-8 px-3 text-xs sm:text-sm [&_svg]:size-4',
				lg: 'h-10 px-4 text-sm [&_svg]:size-4',
				icon: 'h-8 w-8 [&_svg]:size-4'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
		href?: string;
		children?: Snippet;
	} & Omit<HTMLButtonAttributes, 'class'> &
		Omit<HTMLAnchorAttributes, 'class'>;

	let {
		variant = 'default',
		size = 'default',
		class: className,
		href,
		type = 'button',
		disabled = false,
		children,
		...restProps
	}: Props = $props();
</script>

{#if href && !disabled}
	<a
		{href}
		class={cn(buttonVariants({ variant, size }), className)}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		{disabled}
		class={cn(buttonVariants({ variant, size }), className)}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
