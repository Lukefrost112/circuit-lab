import { describe, expect, it } from 'vitest';
import { Complex } from '$lib/engine/complex';
import {
	formatComplexParts,
	formatComplexValue,
	formatDcQuantity,
	formatFrequency,
	formatPolarQuantity,
	formatPowerFactor,
	formatRealPower,
	formatRectangularQuantity
} from './formatters';

describe('results formatters', () => {
	it('formats DC quantities with optional exact repeating rational fractions', () => {
		expect(
			formatDcQuantity(10 / 3, 'V', { precision: 4, showDcFractions: true })
		).toBe('10/3 V = 3.333 V');

		expect(
			formatDcQuantity(10 / 3, 'V', { precision: 3, showDcFractions: false })
		).toBe('3.33 V');

		// Terminating decimals do not emit redundant fractions
		expect(
			formatDcQuantity(12, 'V', { precision: 3, showDcFractions: true })
		).toBe('12 V');
		expect(
			formatDcQuantity(0.004, 'A', { precision: 3, showDcFractions: true })
		).toBe('4 mA');
	});

	it('formats AC polar and rectangular quantities with SI prefixes', () => {
		const v = Complex.from(9.92, -7.45);
		expect(formatRectangularQuantity(v, 'V', 3)).toBe('9.92 - j7.45 V');
		expect(formatPolarQuantity(v, 'V', 3)).toBe('12.4∠-36.9° V');

		const smallI = Complex.fromPolar(0.0124, -36.9);
		expect(formatPolarQuantity(smallI, 'A', 3)).toBe('12.4∠-36.9° mA');
	});

	it('respects angleDisplay: polar, rectangular, and both', () => {
		const c = Complex.fromPolar(12.4, -36.9);

		expect(
			formatComplexValue(c, 'V', 'ac', { angleDisplay: 'polar', precision: 3 })
		).toContain('12.4∠-36.9° V');

		expect(
			formatComplexValue(c, 'V', 'ac', { angleDisplay: 'rectangular', precision: 3 })
		).toContain('9.92 - j7.45 V');

		const both = formatComplexParts(c, 'V', 'ac', { angleDisplay: 'both', precision: 3 });
		expect(both.primary).toBe('12.4∠-36.9° V');
		expect(both.secondary).toBe('9.92 - j7.45 V');
	});

	it('formats power, power factor, and frequency cleanly', () => {
		expect(formatRealPower(1500, { precision: 3 })).toBe('1.5 kW');
		expect(formatPowerFactor(0.85, 'lagging')).toBe('0.85 lag');
		expect(formatPowerFactor(null)).toBe('—');
		expect(formatFrequency(1000)).toBe('1 kHz');
	});
});
