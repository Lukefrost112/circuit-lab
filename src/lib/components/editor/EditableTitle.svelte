<script lang="ts">
	import { tick } from 'svelte';
	import { Pencil } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	interface Props {
		/** Current committed name (empty string renders the fallback). */
		value: string;
		/** Called with the trimmed name (or `fallback` when cleared) on Enter / blur. */
		onCommit: (next: string) => void;
		fallback?: string;
		/** `header`: compact inline toolbar title. `panel`: full-width, touch-sized row. */
		variant?: 'header' | 'panel';
		inputId?: string;
		class?: string;
	}

	let {
		value,
		onCommit,
		fallback = 'Untitled Circuit',
		variant = 'header',
		inputId,
		class: className
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let inputEl = $state<HTMLInputElement | undefined>(undefined);
	let buttonEl = $state<HTMLButtonElement | undefined>(undefined);
	let cancelled = false;

	const displayName = $derived(value.trim() ? value : fallback);

	async function startEditing(): Promise<void> {
		draft = displayName;
		cancelled = false;
		editing = true;
		await tick();
		inputEl?.focus();
		inputEl?.select();
	}

	async function finish(restoreFocus: boolean): Promise<void> {
		if (!editing) return;
		editing = false;
		if (!cancelled) {
			onCommit(draft.trim() || fallback);
		}
		cancelled = false;
		if (restoreFocus) {
			await tick();
			buttonEl?.focus();
		}
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			e.preventDefault();
			void finish(true);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			cancelled = true;
			void finish(true);
		}
	}
</script>

{#if editing}
	<input
		bind:this={inputEl}
		bind:value={draft}
		id={inputId}
		type="text"
		aria-label="Circuit name"
		maxlength={120}
		autocomplete="off"
		spellcheck="false"
		onkeydown={handleKeydown}
		onblur={() => void finish(false)}
		class={cn(
			'rounded-[4px] border border-input bg-card text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
			variant === 'header'
				? 'h-7 w-[220px] px-1.5 text-xs'
				: 'h-11 w-full px-2.5 text-base lg:h-8 lg:text-sm',
			className
		)}
	/>
{:else}
	<button
		bind:this={buttonEl}
		type="button"
		title="Click to rename circuit"
		aria-label="Rename circuit"
		onclick={() => void startEditing()}
		class={cn(
			'group/title inline-flex min-w-0 items-center gap-1.5 rounded-[4px] border border-transparent text-left transition-colors duration-100 hover:border-border hover:bg-card focus-visible:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			variant === 'header'
				? 'h-7 max-w-[220px] px-1.5 text-xs text-muted-foreground hover:text-foreground'
				: 'min-h-11 w-full border-border/70 bg-card px-2.5 text-base text-foreground lg:min-h-8 lg:text-sm',
			className
		)}
	>
		<span class="min-w-0 flex-1 truncate">{displayName}</span>
		<Pencil
			aria-hidden="true"
			class={cn(
				'size-3 shrink-0 text-muted-foreground transition-opacity duration-100',
				variant === 'header' ? 'opacity-0 group-hover/title:opacity-100' : 'opacity-80'
			)}
		/>
	</button>
{/if}
