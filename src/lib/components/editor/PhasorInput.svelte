<script lang="ts">
	import { untrack } from 'svelte';
	import {
		Complex,
		formatEngineering,
		parseComplexValue,
		parseEngineeringNumber
	} from '$lib/engine';
	import { settings } from '$lib/stores/settings.svelte';

	type PhasorMode = 'polar' | 'rect';

	type Props = {
		value: string;
		phaseDeg?: number;
		unit?: string;
		label?: string;
		idPrefix?: string;
		disabled?: boolean;
		onCommit: (next: { value: string; phaseDeg: number }) => void;
	};

	let {
		value,
		phaseDeg,
		unit = '',
		label,
		idPrefix = 'phasor',
		disabled = false,
		onCommit
	}: Props = $props();

	function resolveIncomingComplex(rawValue: string, fallbackPhaseDeg?: number): Complex {
		const raw = rawValue.trim();
		const parsed = parseComplexValue(raw);
		if (!parsed || !parsed.isFinite()) {
			return Complex.zero();
		}
		const hasExplicitAngleOrJ = /[∠@<j]/i.test(raw);
		if (!hasExplicitAngleOrJ && fallbackPhaseDeg !== undefined && Number.isFinite(fallbackPhaseDeg)) {
			return Complex.fromPolar(parsed.re, fallbackPhaseDeg);
		}
		return parsed;
	}

	function detectInitialMode(rawValue: string, fallbackPhaseDeg?: number): PhasorMode {
		const raw = rawValue.trim();
		if (/j/i.test(raw)) {
			return 'rect';
		}
		const c = resolveIncomingComplex(raw, fallbackPhaseDeg);
		const isComplex =
			/[∠@<j]/i.test(raw) ||
			(fallbackPhaseDeg !== undefined && Math.abs(fallbackPhaseDeg) > 1e-9) ||
			!c.isReal(1e-12);
		if (settings.angleDisplay === 'rectangular' && isComplex) {
			return 'rect';
		}
		return 'polar';
	}

	function formatEditableEngineering(n: number, prec = 6): string {
		const cleaned = Math.abs(n) < 1e-12 ? 0 : n;
		if (cleaned === 0) return '0';
		return formatEngineering(cleaned, '', prec).replace(/\s+/g, '').replace(/µ/g, 'u');
	}

	function formatEditableAngle(deg: number): string {
		const cleaned = Math.abs(deg) < 1e-9 ? 0 : deg;
		if (cleaned === 0) return '0';
		return String(Number(cleaned.toFixed(4)));
	}

	function draftsFromComplex(c: Complex) {
		const mag = c.abs();
		const deg = c.isZero() ? 0 : c.argDeg();
		return {
			magDraft: formatEditableEngineering(mag, 6),
			phaseDraft: formatEditableAngle(deg),
			reDraft: formatEditableEngineering(c.re, 6),
			imDraft: formatEditableEngineering(c.im, 6)
		};
	}

	const initialSnapshot = untrack(() => {
		const complex = resolveIncomingComplex(value, phaseDeg);
		return {
			complex,
			drafts: draftsFromComplex(complex),
			mode: detectInitialMode(value, phaseDeg),
			key: `${value}|${phaseDeg ?? ''}`
		};
	});

	let inputMode = $state<PhasorMode>(initialSnapshot.mode);
	let magDraft = $state(initialSnapshot.drafts.magDraft);
	let phaseDraft = $state(initialSnapshot.drafts.phaseDraft);
	let reDraft = $state(initialSnapshot.drafts.reDraft);
	let imDraft = $state(initialSnapshot.drafts.imDraft);

	let focusedField = $state<string | null>(null);
	let dirtySinceSwitch = $state(false);
	let anchorComplex = $state<Complex>(initialSnapshot.complex);
	let lastSyncedKey = $state(initialSnapshot.key);

	$effect(() => {
		const key = `${value}|${phaseDeg ?? ''}`;
		if (!focusedField && key !== lastSyncedKey) {
			const c = resolveIncomingComplex(value, phaseDeg);
			const nextDrafts = draftsFromComplex(c);
			magDraft = nextDrafts.magDraft;
			phaseDraft = nextDrafts.phaseDraft;
			reDraft = nextDrafts.reDraft;
			imDraft = nextDrafts.imDraft;
			anchorComplex = c;
			dirtySinceSwitch = false;
			inputMode = detectInitialMode(value, phaseDeg);
			lastSyncedKey = key;
		}
	});

	type Evaluation =
		| {
				valid: true;
				mode: 'polar';
				complex: Complex;
				mag: number;
				deg: number;
		  }
		| {
				valid: true;
				mode: 'rect';
				complex: Complex;
				re: number;
				im: number;
				deg: number;
		  }
		| {
				valid: false;
				error: string;
		  };

	const evaluation = $derived.by<Evaluation>(() => {
		if (inputMode === 'polar') {
			const magTrim = String(magDraft ?? '').trim();
			const phaseTrim = String(phaseDraft ?? '').trim();
			if (!magTrim) {
				return { valid: false, error: 'Magnitude is required' };
			}
			const mag = parseEngineeringNumber(magTrim);
			if (mag === null || !Number.isFinite(mag)) {
				return {
					valid: false,
					error: 'Enter a valid magnitude (e.g. 120, 50m, 4.7u, 2k)'
				};
			}
			if (!phaseTrim) {
				return { valid: false, error: 'Phase angle is required' };
			}
			const deg = Number(phaseTrim);
			if (!Number.isFinite(deg)) {
				return {
					valid: false,
					error: 'Enter a valid phase angle in degrees (e.g. 0, 30, -45)'
				};
			}
			const complex = Complex.fromPolar(mag, deg);
			return { valid: true, mode: 'polar', complex, mag, deg };
		}

		const reTrim = reDraft.trim();
		const imTrim = imDraft.trim();
		if (!reTrim || !imTrim) {
			return { valid: false, error: 'Real and imaginary parts are required' };
		}
		const re = parseEngineeringNumber(reTrim);
		const im = parseEngineeringNumber(imTrim);
		if (re === null || !Number.isFinite(re) || im === null || !Number.isFinite(im)) {
			return {
				valid: false,
				error: 'Enter numbers with optional SI prefixes (e.g. 30, -500m, 2k)'
			};
		}
		const complex = Complex.from(re, im);
		const deg = complex.isZero()
			? 0
			: Math.abs(complex.argDeg()) < 1e-9
				? 0
				: Number(complex.argDeg().toFixed(4));
		return { valid: true, mode: 'rect', complex, re, im, deg };
	});

	const formattedReadout = $derived.by(() => {
		if (!evaluation.valid) return '';
		const c = evaluation.complex;
		const unitSuffix = unit ? ` ${unit}` : '';
		if (c.isZero()) {
			return `0∠0°${unitSuffix}`;
		}
		const magStr = formatEngineering(c.abs(), '', settings.precision);
		const deg = Math.abs(c.argDeg()) < 1e-9 ? 0 : c.argDeg();
		const degStr = Number(deg.toPrecision(settings.precision)).toString();
		const polarStr = `${magStr}∠${degStr}°${unitSuffix}`;
		const rectStr = `${c.formatRect(settings.precision)}${unitSuffix}`;
		return inputMode === 'polar' ? `${polarStr} (${rectStr})` : `${rectStr} (${polarStr})`;
	});

	function revertDrafts() {
		const c = resolveIncomingComplex(value, phaseDeg);
		const nextDrafts = draftsFromComplex(c);
		magDraft = nextDrafts.magDraft;
		phaseDraft = nextDrafts.phaseDraft;
		reDraft = nextDrafts.reDraft;
		imDraft = nextDrafts.imDraft;
		anchorComplex = c;
		dirtySinceSwitch = false;
	}

	function commitIfValid() {
		if (disabled) return;
		if (!evaluation.valid) {
			revertDrafts();
			return;
		}

		if (evaluation.mode === 'polar') {
			const c = evaluation.complex;
			const magVal = evaluation.mag < 0 ? c.abs() : evaluation.mag;
			const degVal =
				evaluation.mag < 0
					? c.isZero()
						? 0
						: c.argDeg()
					: Math.abs(evaluation.deg) < 1e-9
						? 0
						: evaluation.deg;
			const magStr = formatEditableEngineering(magVal, 6);
			const degStr = formatEditableAngle(degVal);
			const nextVal = `${magStr}∠${degStr}°`;
			const nextPhase = Number(degStr);

			magDraft = magStr;
			phaseDraft = degStr;
			anchorComplex = c;
			dirtySinceSwitch = false;

			const changed =
				nextVal !== value.trim() ||
				(phaseDeg !== undefined && Math.abs(nextPhase - phaseDeg) > 1e-9);
			if (changed) {
				lastSyncedKey = `${nextVal}|${nextPhase}`;
				onCommit({ value: nextVal, phaseDeg: nextPhase });
			}
			return;
		}

		const re = Math.abs(evaluation.re) < 1e-12 ? 0 : evaluation.re;
		const im = Math.abs(evaluation.im) < 1e-12 ? 0 : evaluation.im;
		const reStr = formatEditableEngineering(re, 6);
		const imAbsStr = formatEditableEngineering(Math.abs(im), 6);

		let nextVal: string;
		if (re === 0 && im === 0) {
			nextVal = '0+j0';
		} else if (re === 0) {
			nextVal = im > 0 ? `j${imAbsStr}` : `-j${imAbsStr}`;
		} else if (im === 0) {
			nextVal = `${reStr}+j0`;
		} else if (im > 0) {
			nextVal = `${reStr}+j${imAbsStr}`;
		} else {
			nextVal = `${reStr}-j${imAbsStr}`;
		}

		const nextPhase = evaluation.deg;
		reDraft = reStr;
		imDraft = formatEditableEngineering(im, 6);
		anchorComplex = evaluation.complex;
		dirtySinceSwitch = false;

		const changed =
			nextVal !== value.trim() ||
			(phaseDeg !== undefined && Math.abs(nextPhase - phaseDeg) > 1e-9);
		if (changed) {
			lastSyncedKey = `${nextVal}|${nextPhase}`;
			onCommit({ value: nextVal, phaseDeg: nextPhase });
		}
	}

	function switchMode(nextMode: PhasorMode) {
		if (nextMode === inputMode || disabled) return;
		const currentComplex = !dirtySinceSwitch
			? anchorComplex
			: evaluation.valid
				? evaluation.complex
				: resolveIncomingComplex(value, phaseDeg);

		anchorComplex = currentComplex;
		const converted = draftsFromComplex(currentComplex);
		if (nextMode === 'rect') {
			reDraft = converted.reDraft;
			imDraft = converted.imDraft;
		} else {
			magDraft = converted.magDraft;
			phaseDraft = converted.phaseDraft;
		}
		dirtySinceSwitch = false;
		inputMode = nextMode;
	}

	function handleFocus(field: string) {
		focusedField = field;
	}

	function handleBlur(field: string) {
		if (focusedField === field) {
			focusedField = null;
		}
		commitIfValid();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitIfValid();
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			revertDrafts();
			(e.currentTarget as HTMLInputElement).blur();
		}
	}

	const inputBaseClass =
		'font-engineering flex h-11 min-h-11 w-full rounded-[4px] border bg-card px-2.5 py-1 text-base text-foreground transition-colors duration-150 placeholder:text-muted-foreground/80 hover:border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 lg:h-8 lg:min-h-0 lg:px-2 lg:text-xs';
</script>

<div class="flex flex-col gap-1.5" role="group" aria-label={label ?? 'AC Phasor'}>
	<div class="flex flex-wrap items-center justify-between gap-1.5">
		{#if label}
			<span class="text-xs font-medium text-foreground">{label}</span>
		{/if}
		<div
			role="radiogroup"
			aria-label={label ? `${label} format` : 'Phasor format'}
			class="grid h-auto min-h-11 grid-cols-2 gap-0.5 rounded-[4px] border border-border bg-surface-rail p-0.5 lg:h-7 lg:min-h-0"
		>
			<button
				type="button"
				role="radio"
				aria-checked={inputMode === 'polar'}
				{disabled}
				onclick={() => switchMode('polar')}
				class={`min-h-11 cursor-pointer rounded-[3px] border px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 lg:h-full lg:min-h-0 lg:px-2 lg:text-[11px] ${
					inputMode === 'polar'
						? 'border-border bg-card text-foreground'
						: 'border-transparent text-muted-foreground hover:text-foreground'
				}`}
			>
				Polar
			</button>
			<button
				type="button"
				role="radio"
				aria-checked={inputMode === 'rect'}
				{disabled}
				onclick={() => switchMode('rect')}
				class={`font-engineering min-h-11 cursor-pointer rounded-[3px] border px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 lg:h-full lg:min-h-0 lg:px-2 lg:text-[11px] ${
					inputMode === 'rect'
						? 'border-border bg-card text-foreground'
						: 'border-transparent text-muted-foreground hover:text-foreground'
				}`}
			>
				a + jb
			</button>
		</div>
	</div>

	{#if inputMode === 'polar'}
		<div class="grid grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)] items-end gap-1.5">
			<div class="flex min-w-0 flex-col gap-1">
				<label
					for={`${idPrefix}-mag`}
					class="text-[11px] font-medium text-muted-foreground"
				>
					Magnitude
				</label>
				<div class="relative flex items-center">
					<input
						id={`${idPrefix}-mag`}
						type="text"
						autocomplete="off"
						autocapitalize="off"
						autocorrect="off"
						spellcheck={false}
						placeholder="e.g. 120, 10m"
						{disabled}
						bind:value={magDraft}
						aria-invalid={!evaluation.valid ? 'true' : undefined}
						oninput={() => {
							dirtySinceSwitch = true;
						}}
						onfocus={() => handleFocus('mag')}
						onblur={() => handleBlur('mag')}
						onkeydown={handleKeyDown}
						class={`${inputBaseClass} ${unit ? 'pr-8 lg:pr-7' : ''} ${
							!evaluation.valid
								? 'border-destructive focus-visible:ring-destructive'
								: 'border-input focus-visible:ring-ring'
						}`}
					/>
					{#if unit}
						<span
							class="pointer-events-none absolute right-2.5 font-engineering text-xs text-muted-foreground select-none lg:right-2 lg:text-[11px]"
						>
							{unit}
						</span>
					{/if}
				</div>
			</div>

			<span
				aria-hidden="true"
				class="flex h-11 items-center justify-center px-0.5 font-engineering text-sm font-semibold text-muted-foreground select-none lg:h-8 lg:text-xs"
			>
				∠
			</span>

			<div class="flex min-w-0 flex-col gap-1">
				<label
					for={`${idPrefix}-phase`}
					class="text-[11px] font-medium text-muted-foreground"
				>
					Phase
				</label>
				<div class="relative flex items-center">
					<input
						id={`${idPrefix}-phase`}
						type="number"
						step="any"
						inputmode="decimal"
						placeholder="0"
						{disabled}
						value={phaseDraft}
						aria-invalid={!evaluation.valid ? 'true' : undefined}
						oninput={(e) => {
							phaseDraft = e.currentTarget.value;
							dirtySinceSwitch = true;
						}}
						onfocus={() => handleFocus('phase')}
						onblur={() => handleBlur('phase')}
						onkeydown={handleKeyDown}
						class={`${inputBaseClass} pr-7 lg:pr-6 ${
							!evaluation.valid
								? 'border-destructive focus-visible:ring-destructive'
								: 'border-input focus-visible:ring-ring'
						}`}
					/>
					<span
						class="pointer-events-none absolute right-2.5 font-engineering text-xs text-muted-foreground select-none lg:right-2 lg:text-[11px]"
					>
						°
					</span>
				</div>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5">
			<div class="flex min-w-0 flex-col gap-1">
				<label
					for={`${idPrefix}-re`}
					class="text-[11px] font-medium text-muted-foreground"
				>
					Real (Re)
				</label>
				<input
					id={`${idPrefix}-re`}
					type="text"
					autocomplete="off"
					autocapitalize="off"
					autocorrect="off"
					spellcheck={false}
					placeholder="e.g. 30"
					{disabled}
					bind:value={reDraft}
					aria-invalid={!evaluation.valid ? 'true' : undefined}
					oninput={() => {
						dirtySinceSwitch = true;
					}}
					onfocus={() => handleFocus('re')}
					onblur={() => handleBlur('re')}
					onkeydown={handleKeyDown}
					class={`${inputBaseClass} ${
						!evaluation.valid
							? 'border-destructive focus-visible:ring-destructive'
							: 'border-input focus-visible:ring-ring'
					}`}
				/>
			</div>

			<span
				aria-hidden="true"
				class="flex h-11 items-center justify-center px-0.5 font-engineering text-xs font-semibold text-muted-foreground select-none lg:h-8"
			>
				+ j
			</span>

			<div class="flex min-w-0 flex-col gap-1">
				<label
					for={`${idPrefix}-im`}
					class="text-[11px] font-medium text-muted-foreground"
				>
					Imag (Im)
				</label>
				<div class="relative flex items-center">
					<input
						id={`${idPrefix}-im`}
						type="text"
						autocomplete="off"
						autocapitalize="off"
						autocorrect="off"
						spellcheck={false}
						placeholder="e.g. 40, -500m"
						{disabled}
						bind:value={imDraft}
						aria-invalid={!evaluation.valid ? 'true' : undefined}
						oninput={() => {
							dirtySinceSwitch = true;
						}}
						onfocus={() => handleFocus('im')}
						onblur={() => handleBlur('im')}
						onkeydown={handleKeyDown}
						class={`${inputBaseClass} ${unit ? 'pr-8 lg:pr-7' : ''} ${
							!evaluation.valid
								? 'border-destructive focus-visible:ring-destructive'
								: 'border-input focus-visible:ring-ring'
						}`}
					/>
					{#if unit}
						<span
							class="pointer-events-none absolute right-2.5 font-engineering text-xs text-muted-foreground select-none lg:right-2 lg:text-[11px]"
						>
							{unit}
						</span>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if !evaluation.valid}
		<p class="text-[11px] leading-tight text-destructive" role="alert">
			{evaluation.error}
		</p>
	{:else if formattedReadout}
		<p class="font-engineering text-[11px] leading-tight text-muted-foreground">
			= {formattedReadout}
		</p>
	{/if}
</div>
