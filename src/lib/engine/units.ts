/**
 * SI engineering prefix parsing/formatting and complex phasor string parsing.
 */

import { Complex } from './complex';

const SI_PREFIXES: Record<string, number> = {
	f: 1e-15,
	p: 1e-12,
	n: 1e-9,
	u: 1e-6,
	µ: 1e-6,
	μ: 1e-6,
	m: 1e-3,
	k: 1e3,
	K: 1e3,
	M: 1e6,
	Meg: 1e6,
	meg: 1e6,
	G: 1e9,
	T: 1e12
};

const KNOWN_UNITS = new Set([
	'ω',
	'ohm',
	'ohms',
	'f',
	'h',
	'v',
	'a',
	'hz',
	'w',
	'va',
	'var',
	's'
]);

const DISPLAY_PREFIXES: Array<{ exp: number; symbol: string; factor: number }> = [
	{ exp: 12, symbol: 'T', factor: 1e12 },
	{ exp: 9, symbol: 'G', factor: 1e9 },
	{ exp: 6, symbol: 'M', factor: 1e6 },
	{ exp: 3, symbol: 'k', factor: 1e3 },
	{ exp: 0, symbol: '', factor: 1 },
	{ exp: -3, symbol: 'm', factor: 1e-3 },
	{ exp: -6, symbol: 'µ', factor: 1e-6 },
	{ exp: -9, symbol: 'n', factor: 1e-9 },
	{ exp: -12, symbol: 'p', factor: 1e-12 },
	{ exp: -15, symbol: 'f', factor: 1e-15 }
];

function stripUnitSuffix(tail: string): { prefixFactor: number; valid: boolean } {
	const cleaned = tail.trim();
	if (cleaned === '') return { prefixFactor: 1, valid: true };

	// For single-character suffixes, SI prefixes (e.g. 'f' femto, 'm' milli) take
	// precedence over case-insensitive unit letters (e.g. 'F' Farad).
	if (cleaned.length === 1) {
		if (cleaned in SI_PREFIXES) {
			return { prefixFactor: SI_PREFIXES[cleaned], valid: true };
		}
		if (KNOWN_UNITS.has(cleaned.toLowerCase())) {
			return { prefixFactor: 1, valid: true };
		}
		return { prefixFactor: 1, valid: false };
	}

	// Check multi-character bare units (e.g. "ohm", "ohms", "Hz", "VA", "VAR")
	if (KNOWN_UNITS.has(cleaned.toLowerCase())) {
		return { prefixFactor: 1, valid: true };
	}

	// Check multi-char "Meg" / "meg" prefix first
	if (cleaned.startsWith('Meg') || cleaned.startsWith('meg')) {
		const rest = cleaned.slice(3).trim();
		if (rest === '' || KNOWN_UNITS.has(rest.toLowerCase())) {
			return { prefixFactor: 1e6, valid: true };
		}
		return { prefixFactor: 1, valid: false };
	}

	// Check single-char SI prefix followed by a unit (e.g. "10kΩ", "5.5fF", "4.7µF", "100mH")
	const first = cleaned[0];
	if (first in SI_PREFIXES) {
		const rest = cleaned.slice(1).trim();
		if (rest === '' || KNOWN_UNITS.has(rest.toLowerCase())) {
			return { prefixFactor: SI_PREFIXES[first], valid: true };
		}
	}

	return { prefixFactor: 1, valid: false };
}

/**
 * Parses an engineering number with optional SI prefix and unit.
 * Examples: "10k" -> 10000, "4.7u" -> 4.7e-6, "100m" -> 0.1, "2.2M" -> 2.2e6, "470 Ω" -> 470.
 * Returns `null` if the string cannot be parsed.
 */
export function parseEngineeringNumber(input: string | number): number | null {
	if (typeof input === 'number') {
		return Number.isFinite(input) ? input : null;
	}
	const trimmed = input.trim();
	if (!trimmed) return null;

	const match = trimmed.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/);
	if (!match) return null;

	const base = Number(match[1]);
	if (!Number.isFinite(base)) return null;

	const { prefixFactor, valid } = stripUnitSuffix(match[2]);
	if (!valid) return null;

	const result = base * prefixFactor;
	return Number.isFinite(result) ? result : null;
}

/**
 * Parses a real or complex engineering value.
 * Supports:
 * - Polar: "50∠30°", "50@-30", "10k∠-45 deg"
 * - Rectangular: "30+j40", "30-40j", "j100", "-j50", "1e-3+j2e-3", "j", "-j"
 * - Pure real engineering numbers: "10k", "470 Ω"
 */
export function parseComplexValue(input: string | number): Complex | null {
	if (typeof input === 'number') {
		return Number.isFinite(input) ? Complex.from(input, 0) : null;
	}
	const trimmed = input.trim();
	if (!trimmed) return null;

	// Strip trailing common electrical units when attached after polar/complex forms like "(30+j40) V" or "50∠30° V"
	const polarMatch = trimmed.match(/^(.+?)\s*(?:∠|@)\s*(.+?)(?:°|deg)?(?:\s*[VAWΩvaw]+)?$/i);
	if (polarMatch) {
		const mag = parseEngineeringNumber(polarMatch[1]);
		// Angle should be a plain number (possibly with ° or deg stripped)
		const angleStr = polarMatch[2].replace(/(?:°|deg)\s*$/i, '').trim();
		const deg = Number(angleStr);
		if (mag !== null && angleStr !== '' && Number.isFinite(deg)) {
			return Complex.fromPolar(mag, deg);
		}
		return null;
	}

	// Try pure real engineering number first
	const realOnly = parseEngineeringNumber(trimmed);
	if (realOnly !== null) {
		return Complex.from(realOnly, 0);
	}

	// Normalize whitespace for rectangular complex parsing
	const compact = trimmed.replace(/\s+/g, '');

	// Pure imaginary: "[+-]?j<num>" or "[+-]?<num>j" or "[+-]?j"
	const pureJPrefix = compact.match(/^([+-]?)j(.*)$/i);
	if (pureJPrefix) {
		const sign = pureJPrefix[1] === '-' ? -1 : 1;
		const rest = pureJPrefix[2];
		if (rest === '') return Complex.from(0, sign);
		const val = parseEngineeringNumber(rest);
		if (val !== null) return Complex.from(0, sign * val);
	}

	const pureJSuffix = compact.match(/^(.+?)j$/i);
	if (pureJSuffix && !/[+-]/.test(pureJSuffix[1].replace(/^[+-]/, '').replace(/[eE][+-]/g, ''))) {
		const val = parseEngineeringNumber(pureJSuffix[1]);
		if (val !== null) return Complex.from(0, val);
	}

	// General rectangular form: <realTerm><op><imagTerm>
	// Scan for binary '+' or '-' that is not at index 0 and not immediately preceded by 'e' or 'E'.
	let splitIdx = -1;
	for (let i = 1; i < compact.length; i++) {
		const ch = compact[i];
		if ((ch === '+' || ch === '-') && compact[i - 1] !== 'e' && compact[i - 1] !== 'E') {
			splitIdx = i;
			break;
		}
	}

	if (splitIdx !== -1) {
		const left = compact.slice(0, splitIdx);
		const right = compact.slice(splitIdx); // includes leading '+' or '-'
		const re = parseEngineeringNumber(left);
		if (re === null) return null;

		const imag = parseComplexValue(right);
		if (imag !== null && imag.re === 0) {
			return Complex.from(re, imag.im);
		}
	}

	return null;
}

/**
 * Formats a real scalar value using SI engineering prefixes and an optional unit.
 */
export function formatEngineering(value: number, unit = '', prec = 3): string {
	if (!Number.isFinite(value)) return String(value);
	if (value === 0 || Math.abs(value) < 1e-18) {
		return unit ? `0 ${unit}` : '0';
	}

	const abs = Math.abs(value);
	let chosen = DISPLAY_PREFIXES[DISPLAY_PREFIXES.length - 1];
	for (const candidate of DISPLAY_PREFIXES) {
		if (abs >= candidate.factor * (1 - 1e-12)) {
			chosen = candidate;
			break;
		}
	}

	// Handle numbers larger than 1000 T or smaller than 1 f
	if (abs >= 1e15 || abs < 1e-15) {
		const expStr = Number(value.toPrecision(prec)).toExponential().replace(/e\+?/, 'e');
		return unit ? `${expStr} ${unit}` : expStr;
	}

	const scaled = value / chosen.factor;
	// If rounding bumps 999.999 to 1000, step up one SI tier if available
	const rounded = Number(scaled.toPrecision(prec));
	if (Math.abs(rounded) >= 1000) {
		const idx = DISPLAY_PREFIXES.indexOf(chosen);
		if (idx > 0) {
			chosen = DISPLAY_PREFIXES[idx - 1];
			const rescaled = Number((value / chosen.factor).toPrecision(prec));
			const numStr = rescaled.toString();
			return unit ? `${numStr} ${chosen.symbol}${unit}` : `${numStr}${chosen.symbol}`;
		}
	}

	const numStr = rounded.toString();
	return unit ? `${numStr} ${chosen.symbol}${unit}` : `${numStr}${chosen.symbol}`;
}
