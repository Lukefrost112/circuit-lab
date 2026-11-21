<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import {
		Complex,
		formatEngineering,
		parseComplexValue,
		parseEngineeringNumber
	} from '$lib/engine';
	import { settings } from '$lib/stores/settings.svelte';
	import { cn } from '$lib/utils';

	type Props = {
		value?: string;
		unit?: string;
		allowComplex?: boolean;
		positiveOnly?: boolean;
		allowZero?: boolean;
		onCommit?: (value: string) => void;
		class?: string;
	} & Omit<HTMLInputAttributes, 'class' | 'value'>;

	let {
		value = $bindable(''),
		unit = '',
		allowComplex = false,
		positiveOnly = false,
		allowZero = true,
		onCommit,
		disabled = false,
		class: className,
		...restProps
	}: Props = $props();

	let draft = $state(value);
	let focused = $state(false);
	let initialOnFocus = $state(value);

	$effect(() => {
		if (!focused) {
			draft = value;
		}
	});

	interface ParseEvaluation {
		valid: boolean;
		formatted?: string;
		error?: string;
	}

	const evaluation = $derived.by<ParseEvaluation>(() => {
		const trimmed = draft.trim();
		if (!trimmed) {
			return { valid: false, error: 'Value is required' };
		}

		if (allowComplex) {
			const parsed = parseComplexValue(trimmed);
			if (!parsed || !parsed.isFinite()) {
				return {
					valid: false,
					error: 'Enter a scalar or phasor (e.g. 120∠30°, 50@-45, 30+j40)'
				};
			}

			if (positiveOnly && parsed.abs() <= 0) {
				return { valid: false, error: 'Magnitude must be greater than 0' };
			}
			if (!allowZero && parsed.isZero()) {
				return { valid: false, error: 'Value cannot be zero' };
			}

			if (parsed.isReal(1e-12)) {
				return {
					valid: true,
					formatted: formatEngineering(parsed.re, unit, settings.precision)
				};
			}

			const mag = parsed.abs();
			const magStr = formatEngineering(mag, '', settings.precision);
			const deg = Math.abs(parsed.argDeg()) < 1e-9 ? 0 : parsed.argDeg();
			const degStr = Number(deg.toPrecision(settings.precision)).toString();
			const polar = `${magStr}∠${degStr}°${unit ? ` ${unit}` : ''}`;

			if (settings.angleDisplay === 'rectangular') {
				return {
					valid: true,
					formatted: `${parsed.formatRect(settings.precision)}${unit ? ` ${unit}` : ''}`
				};
			}
			return { valid: true, formatted: polar };
		}

		const num = parseEngineeringNumber(trimmed);
		if (num === null || !Number.isFinite(num)) {
			return {
				valid: false,
				error: 'Invalid engineering value (e.g. 10k, 4.7u, 100m, 2.2M)'
			};
		}
		if (positiveOnly && num <= 0) {
			return { valid: false, error: 'Value must be greater than 0' };
		}
		if (!allowZero && num === 0) {
			return { valid: false, error: 'Value cannot be zero' };
		}

		return {
			valid: true,
			formatted: formatEngineering(num, unit, settings.precision)
		};
	});

	function commitIfValid() {
		const trimmed = draft.trim();
		if (evaluation.valid && trimmed !== initialOnFocus.trim()) {
			value = trimmed;
			onCommit?.(trimmed);
			initialOnFocus = trimmed;
		} else if (!evaluation.valid) {
			// Revert invalid draft on blur back to last committed value
			draft = value;
		}
	}

	function handleFocus() {
		focused = true;
		initialOnFocus = value;
	}

	function handleBlur() {
		focused = false;
		commitIfValid();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const trimmed = draft.trim();
			if (evaluation.valid) {
				value = trimmed;
				if (trimmed !== initialOnFocus.trim()) {
					onCommit?.(trimmed);
					initialOnFocus = trimmed;
				}
			}
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			draft = value;
			(e.currentTarget as HTMLInputElement).blur();
		}
	}

	// Keep unused Complex import referenced cleanly if needed, or remove
	void Complex;
</script>

<div class="flex flex-col gap-1">
	<div class="relative flex items-center">
		<input
			type="text"
			bind:value={draft}
			{disabled}
			aria-invalid={!evaluation.valid ? 'true' : undefined}
			onfocus={handleFocus}
			onblur={handleBlur}
			onkeydown={handleKeyDown}
			class={cn(
				'font-engineering flex h-8 w-full rounded-md border border-input bg-card px-2.5 py-1 text-xs sm:text-sm text-foreground shadow-2xs transition-colors duration-150',
				'placeholder:text-muted-foreground/80',
				'hover:border-muted-foreground/50',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
				'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
				unit && 'pr-8',
				!evaluation.valid && 'border-destructive focus-visible:ring-destructive',
				className
			)}
			{...restProps}
		/>
		{#if unit}
			<span
				class="pointer-events-none absolute right-2.5 font-engineering text-[11px] text-muted-foreground select-none"
			>
				{unit}
			</span>
		{/if}
	</div>

	{#if !evaluation.valid && evaluation.error}
		<p class="text-[11px] leading-tight text-destructive" role="alert">
			{evaluation.error}
		</p>
	{:else if evaluation.formatted}
		<p class="font-engineering text-[11px] leading-tight text-muted-foreground">
			= {evaluation.formatted}
		</p>
	{/if}
</div>
