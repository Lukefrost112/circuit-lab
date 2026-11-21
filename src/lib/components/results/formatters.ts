import { Complex, formatRational } from '$lib/engine/complex';
import type { AnalysisMode } from '$lib/engine/types';
import { formatEngineering } from '$lib/engine/units';
import {
	settings,
	type AngleDisplay,
	type DisplayPrecision
} from '$lib/stores/settings.svelte';

export interface FormatOptions {
	angleDisplay?: AngleDisplay;
	precision?: DisplayPrecision;
	showDcFractions?: boolean;
}

export interface FormattedValueParts {
	primary: string;
	secondary?: string;
}

const ZERO_EPS = 1e-12;

const DISPLAY_PREFIXES: Array<{ symbol: string; factor: number }> = [
	{ symbol: 'T', factor: 1e12 },
	{ symbol: 'G', factor: 1e9 },
	{ symbol: 'M', factor: 1e6 },
	{ symbol: 'k', factor: 1e3 },
	{ symbol: '', factor: 1 },
	{ symbol: 'm', factor: 1e-3 },
	{ symbol: 'µ', factor: 1e-6 },
	{ symbol: 'n', factor: 1e-9 },
	{ symbol: 'p', factor: 1e-12 },
	{ symbol: 'f', factor: 1e-15 }
];

function resolveOptions(opts?: FormatOptions): Required<FormatOptions> {
	return {
		angleDisplay: opts?.angleDisplay ?? settings.angleDisplay,
		precision: opts?.precision ?? settings.precision,
		showDcFractions: opts?.showDcFractions ?? settings.showDcFractions
	};
}

function formatScalar(n: number, prec: number): string {
	const cleaned = Math.abs(n) < ZERO_EPS ? 0 : n;
	if (cleaned === 0) return '0';
	const abs = Math.abs(cleaned);
	if (abs >= 1e-4 && abs < 1e6) {
		return Number(cleaned.toPrecision(prec)).toString();
	}
	return Number(cleaned.toPrecision(prec)).toExponential().replace(/e\+?/, 'e');
}

function pickSiPrefix(absValue: number): { symbol: string; factor: number } | null {
	if (absValue === 0 || absValue < 1e-15 || absValue >= 1e15) {
		return null;
	}
	for (const tier of DISPLAY_PREFIXES) {
		if (absValue >= tier.factor * (1 - 1e-12)) {
			return tier;
		}
	}
	return DISPLAY_PREFIXES[DISPLAY_PREFIXES.length - 1];
}

function hasNonTerminatingDenominator(rat: string): boolean {
	const slashIdx = rat.indexOf('/');
	if (slashIdx === -1) return false;
	let den = Number(rat.slice(slashIdx + 1));
	if (!Number.isInteger(den) || den <= 1) return false;
	while (den % 2 === 0) den /= 2;
	while (den % 5 === 0) den /= 5;
	return den > 1;
}

/**
 * Formats a real DC quantity with SI engineering units, optionally prepending
 * an exact rational fraction (e.g. `10/3 V = 3.33 V`) when `showDcFractions`
 * is enabled and a clean repeating fraction exists.
 */
export function formatDcQuantity(value: number, unit: string, opts?: FormatOptions): string {
	const { precision, showDcFractions } = resolveOptions(opts);
	const cleaned = Math.abs(value) < ZERO_EPS ? 0 : value;
	const eng = formatEngineering(cleaned, unit, precision);

	if (!showDcFractions || cleaned === 0 || Math.abs(cleaned) < 1e-3 || Math.abs(cleaned) > 1e4) {
		return eng;
	}

	const rat = formatRational(cleaned, 250);
	if (rat && hasNonTerminatingDenominator(rat)) {
		return unit ? `${rat} ${unit} = ${eng}` : `${rat} = ${eng}`;
	}

	return eng;
}

/**
 * Formats a complex number in polar form with SI engineering unit prefix.
 * Example: `12.4∠-36.9° V` or `5.2∠30° mA`.
 */
export function formatPolarQuantity(
	c: Complex,
	unit: string,
	prec: number = settings.precision
): string {
	const mag = c.abs();
	if (mag < ZERO_EPS) {
		return unit ? `0∠0° ${unit}` : '0∠0°';
	}

	const deg = Math.abs(c.argDeg()) < ZERO_EPS ? 0 : c.argDeg();
	const degStr = formatScalar(deg, prec);
	const tier = pickSiPrefix(mag);

	if (!tier) {
		const magStr = formatScalar(mag, prec);
		return unit ? `${magStr}∠${degStr}° ${unit}` : `${magStr}∠${degStr}°`;
	}

	let chosen = tier;
	let roundedMag = Number((mag / chosen.factor).toPrecision(prec));
	if (Math.abs(roundedMag) >= 1000) {
		const idx = DISPLAY_PREFIXES.indexOf(chosen);
		if (idx > 0) {
			chosen = DISPLAY_PREFIXES[idx - 1];
			roundedMag = Number((mag / chosen.factor).toPrecision(prec));
		}
	}

	const unitWithPrefix = `${chosen.symbol}${unit}`;
	return unitWithPrefix
		? `${roundedMag}∠${degStr}° ${unitWithPrefix}`
		: `${roundedMag}∠${degStr}°`;
}

/**
 * Formats a complex number in rectangular form with SI engineering unit prefix.
 * Example: `9.92 - j7.45 V`.
 */
export function formatRectangularQuantity(
	c: Complex,
	unit: string,
	prec: number = settings.precision
): string {
	const reZero = Math.abs(c.re) < ZERO_EPS;
	const imZero = Math.abs(c.im) < ZERO_EPS;
	if (reZero && imZero) {
		return unit ? `0 ${unit}` : '0';
	}

	const dominant = Math.max(Math.abs(c.re), Math.abs(c.im));
	const tier = pickSiPrefix(dominant);
	const factor = tier ? tier.factor : 1;
	const prefix = tier ? tier.symbol : '';

	const reScaled = c.re / factor;
	const imScaled = c.im / factor;
	const unitWithPrefix = `${prefix}${unit}`;

	if (imZero) {
		const reStr = formatScalar(reScaled, prec);
		return unitWithPrefix ? `${reStr} ${unitWithPrefix}` : reStr;
	}

	const imAbsStr = formatScalar(Math.abs(imScaled), prec);
	const imTerm = imAbsStr === '1' ? 'j' : `j${imAbsStr}`;

	if (reZero) {
		const signedIm = imScaled < 0 ? `-${imTerm}` : imTerm;
		return unitWithPrefix ? `${signedIm} ${unitWithPrefix}` : signedIm;
	}

	const reStr = formatScalar(reScaled, prec);
	const sign = imScaled < 0 ? ' - ' : ' + ';
	const body = `${reStr}${sign}${imTerm}`;
	return unitWithPrefix ? `${body} ${unitWithPrefix}` : body;
}

/**
 * Formats a `Complex` quantity into primary (and optional secondary) strings
 * honoring the active analysis mode and user formatting settings.
 */
export function formatComplexParts(
	c: Complex,
	unit: string,
	mode: AnalysisMode,
	opts?: FormatOptions
): FormattedValueParts {
	const resolved = resolveOptions(opts);

	if (mode === 'dc') {
		return { primary: formatDcQuantity(c.re, unit, resolved) };
	}

	const polar = formatPolarQuantity(c, unit, resolved.precision);
	const rect = formatRectangularQuantity(c, unit, resolved.precision);

	if (resolved.angleDisplay === 'polar') {
		return { primary: polar };
	}
	if (resolved.angleDisplay === 'rectangular') {
		return { primary: rect };
	}
	return { primary: polar, secondary: rect };
}

/**
 * Formats a `Complex` quantity as a single string honoring user settings.
 */
export function formatComplexValue(
	c: Complex,
	unit: string,
	mode: AnalysisMode,
	opts?: FormatOptions
): string {
	const parts = formatComplexParts(c, unit, mode, opts);
	return parts.secondary ? `${parts.primary} (${parts.secondary})` : parts.primary;
}

export function formatRealPower(watts: number, opts?: FormatOptions): string {
	const { precision } = resolveOptions(opts);
	const cleaned = Math.abs(watts) < ZERO_EPS ? 0 : watts;
	return formatEngineering(cleaned, 'W', precision);
}

export function formatReactivePower(vars: number, opts?: FormatOptions): string {
	const { precision } = resolveOptions(opts);
	const cleaned = Math.abs(vars) < ZERO_EPS ? 0 : vars;
	return formatEngineering(cleaned, 'VAR', precision);
}

export function formatApparentPower(va: number, opts?: FormatOptions): string {
	const { precision } = resolveOptions(opts);
	const cleaned = Math.abs(va) < ZERO_EPS ? 0 : va;
	return formatEngineering(cleaned, 'VA', precision);
}

export function formatPowerFactor(
	pf: number | null,
	pfType?: 'leading' | 'lagging' | 'unity'
): string {
	if (pf === null || !Number.isFinite(pf)) return '—';
	const clamped = Math.min(1, Math.max(0, Math.abs(pf)));
	const numStr = clamped.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
	if (pfType === 'leading') return `${numStr} lead`;
	if (pfType === 'lagging') return `${numStr} lag`;
	return numStr;
}

export function formatFrequency(hz: number): string {
	return formatEngineering(hz, 'Hz', 4);
}
