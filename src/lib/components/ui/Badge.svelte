<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const badgeVariants = tv({
		base: 'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-none tracking-tight transition-colors select-none',
		variants: {
			variant: {
				default: 'border-transparent bg-primary text-primary-foreground',
				secondary: 'border-border bg-secondary text-secondary-foreground',
				outline: 'border-border bg-transparent text-foreground',
				success:
					'border-success/30 bg-success/10 text-success dark:border-success/35 dark:bg-success/15',
				warning:
					'border-warning/30 bg-warning/10 text-warning dark:border-warning/35 dark:bg-warning/15',
				destructive:
					'border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/35 dark:bg-destructive/15',
				voltage:
					'border-voltage/30 bg-voltage/10 text-voltage font-engineering dark:border-voltage/35 dark:bg-voltage/15',
				current:
					'border-branch-current/30 bg-branch-current/10 text-branch-current font-engineering dark:border-branch-current/35 dark:bg-branch-current/15'
			}
		},
		defaultVariants: {
			variant: 'secondary'
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Props = {
		variant?: BadgeVariant;
		class?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLSpanElement>, 'class'>;

	let { variant = 'secondary', class: className, children, ...restProps }: Props = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)} {...restProps}>
	{@render children?.()}
</span>
