import { describe, expect, it } from 'vitest';
import { Complex, formatRational } from '../complex';

describe('Complex', () => {
	it('constructs rectangular and polar numbers accurately', () => {
		const a = Complex.from(3, 4);
		expect(a.re).toBe(3);
		expect(a.im).toBe(4);
		expect(a.abs()).toBeCloseTo(5, 12);
		expect(a.argDeg()).toBeCloseTo(53.13010235415598, 10);

		const p = Complex.fromPolar(10, 60);
		expect(p.re).toBeCloseTo(5, 12);
		expect(p.im).toBeCloseTo(5 * Math.sqrt(3), 12);

		expect(Complex.zero().isZero()).toBe(true);
		expect(Complex.one().equals(Complex.from(1, 0))).toBe(true);
		expect(Complex.j().equals(Complex.from(0, 1))).toBe(true);
	});

	it('performs exact arithmetic operations without mutating operands', () => {
		const a = Complex.from(3, 4);
		const b = Complex.from(1, -2);

		expect(a.add(b).equals(Complex.from(4, 2))).toBe(true);
		expect(a.sub(b).equals(Complex.from(2, 6))).toBe(true);
		expect(a.mul(b).equals(Complex.from(11, -2))).toBe(true);
		expect(a.div(b).equals(Complex.from(-1, 2))).toBe(true);
		expect(a.neg().equals(Complex.from(-3, -4))).toBe(true);
		expect(a.conj().equals(Complex.from(3, -4))).toBe(true);
		expect(Complex.from(0, 2).inv().equals(Complex.from(0, -0.5))).toBe(true);

		// Ensure operands stayed immutable
		expect(a.re).toBe(3);
		expect(a.im).toBe(4);
	});

	it('throws on division by zero', () => {
		expect(() => Complex.one().div(Complex.zero())).toThrow();
	});

	it('handles numerically large/small complex division via Smith formula', () => {
		const a = Complex.from(1e200, 1e200);
		const b = Complex.from(1e200, -1e200);
		const res = a.div(b);
		expect(res.equals(Complex.from(0, 1), 1e-12)).toBe(true);
	});

	it('formats rectangular, polar, and LaTeX representations cleanly', () => {
		expect(Complex.zero().formatRect()).toBe('0');
		expect(Complex.from(5, 0).formatRect()).toBe('5');
		expect(Complex.from(0, 1).formatRect()).toBe('j');
		expect(Complex.from(0, -1).formatRect()).toBe('-j');
		expect(Complex.from(3, 4).formatRect()).toBe('3 + j4');
		expect(Complex.from(3, -4).formatRect()).toBe('3 - j4');

		expect(Complex.from(3, 4).formatPolar(4)).toBe('5∠53.13°');
		expect(Complex.zero().formatPolar()).toBe('0∠0°');
		expect(Complex.from(3, 4).toLatexPolar(4)).toBe('5\\angle 53.13^\\circ');
		expect(Complex.from(3, -4).toLatexRect()).toBe('3 - j4');
	});

	it('computes continued-fraction rational approximations', () => {
		expect(formatRational(10 / 3)).toBe('10/3');
		expect(formatRational(-7 / 4)).toBe('-7/4');
		expect(formatRational(5)).toBe('5');
		expect(formatRational(0)).toBe('0');
		expect(formatRational(96 / 7)).toBe('96/7');
		expect(formatRational(Math.PI, 1000)).toBeNull();
		expect(formatRational(Number.NaN)).toBeNull();
	});
});
