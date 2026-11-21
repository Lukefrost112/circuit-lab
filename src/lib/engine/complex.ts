/**
 * Complex number arithmetic and textbook formatting utilities for Circuit Lab.
 * All operations are pure and return new immutable Complex instances.
 */

const ZERO_EPS = 1e-12;

function cleanZero(n: number): number {
	return n === 0 ? 0 : n;
}

function formatScalar(n: number, prec: number): string {
	const cleaned = Math.abs(n) < ZERO_EPS ? 0 : n;
	if (cleaned === 0) return '0';
	// Use toPrecision for clean significant digits, then strip unnecessary trailing decimal zeros
	const abs = Math.abs(cleaned);
	if (abs >= 1e-4 && abs < 1e6) {
		return Number(cleaned.toPrecision(prec)).toString();
	}
	return Number(cleaned.toPrecision(prec)).toExponential().replace(/e\+?/, 'e');
}

/**
 * Continued-fraction rational approximation of a real number.
 * Returns a clean fraction string like `"10/3"` or `"-5"` when within `1e-9`
 * of a rational with denominator <= `maxDenom`, or `null` otherwise.
 */
export function formatRational(x: number, maxDenom = 1000): string | null {
	if (!Number.isFinite(x)) return null;
	if (Math.abs(x) <= 1e-12) return '0';

	const sign = x < 0 ? '-' : '';
	const val = Math.abs(x);

	let h0 = 0;
	let k0 = 1;
	let h1 = 1;
	let k1 = 0;
	let r = val;

	for (let iter = 0; iter < 64; iter++) {
		const a = Math.floor(r);
		const h2 = a * h1 + h0;
		const k2 = a * k1 + k0;

		if (k2 > maxDenom) {
			break;
		}

		if (Math.abs(val - h2 / k2) <= 1e-9) {
			return k2 === 1 ? `${sign}${h2}` : `${sign}${h2}/${k2}`;
		}

		h0 = h1;
		k0 = k1;
		h1 = h2;
		k1 = k2;

		const frac = r - a;
		if (frac <= 1e-12) break;
		r = 1 / frac;
		if (!Number.isFinite(r) || r > 1e12) break;
	}

	if (k1 > 0 && k1 <= maxDenom && Math.abs(val - h1 / k1) <= 1e-9) {
		return k1 === 1 ? `${sign}${h1}` : `${sign}${h1}/${k1}`;
	}

	return null;
}

export class Complex {
	readonly re: number;
	readonly im: number;

	private constructor(re: number, im: number) {
		this.re = cleanZero(re);
		this.im = cleanZero(im);
	}

	static from(re: number, im = 0): Complex {
		return new Complex(re, im);
	}

	static fromPolar(mag: number, deg: number): Complex {
		const rad = (deg * Math.PI) / 180;
		return new Complex(mag * Math.cos(rad), mag * Math.sin(rad));
	}

	static fromPolarRad(mag: number, rad: number): Complex {
		return new Complex(mag * Math.cos(rad), mag * Math.sin(rad));
	}

	static zero(): Complex {
		return new Complex(0, 0);
	}

	static one(): Complex {
		return new Complex(1, 0);
	}

	static j(im = 1): Complex {
		return new Complex(0, im);
	}

	add(other: Complex): Complex {
		return new Complex(this.re + other.re, this.im + other.im);
	}

	sub(other: Complex): Complex {
		return new Complex(this.re - other.re, this.im - other.im);
	}

	mul(other: Complex): Complex {
		return new Complex(
			this.re * other.re - this.im * other.im,
			this.re * other.im + this.im * other.re
		);
	}

	scale(k: number): Complex {
		return new Complex(this.re * k, this.im * k);
	}

	div(other: Complex): Complex {
		// Numerically stable Smith's complex division algorithm
		const ar = Math.abs(other.re);
		const ai = Math.abs(other.im);
		if (ar === 0 && ai === 0) {
			throw new Error('Division by zero complex number');
		}
		if (ar >= ai) {
			const r = other.im / other.re;
			const denom = other.re + other.im * r;
			return new Complex(
				(this.re + this.im * r) / denom,
				(this.im - this.re * r) / denom
			);
		}
		const r = other.re / other.im;
		const denom = other.im + other.re * r;
		return new Complex(
			(this.re * r + this.im) / denom,
			(this.im * r - this.re) / denom
		);
	}

	neg(): Complex {
		return new Complex(-this.re, -this.im);
	}

	conj(): Complex {
		return new Complex(this.re, -this.im);
	}

	inv(): Complex {
		return Complex.one().div(this);
	}

	absSq(): number {
		return this.re * this.re + this.im * this.im;
	}

	abs(): number {
		return Math.hypot(this.re, this.im);
	}

	argRad(): number {
		if (this.re === 0 && this.im === 0) return 0;
		return Math.atan2(this.im, this.re);
	}

	argDeg(): number {
		return (this.argRad() * 180) / Math.PI;
	}

	equals(other: Complex, eps = 1e-9): boolean {
		return Math.abs(this.re - other.re) <= eps && Math.abs(this.im - other.im) <= eps;
	}

	isZero(eps = 1e-12): boolean {
		return this.abs() <= eps;
	}

	isReal(eps = 1e-12): boolean {
		return Math.abs(this.im) <= eps;
	}

	isFinite(): boolean {
		return Number.isFinite(this.re) && Number.isFinite(this.im);
	}

	formatRect(prec = 4): string {
		const reZero = Math.abs(this.re) < ZERO_EPS;
		const imZero = Math.abs(this.im) < ZERO_EPS;
		if (reZero && imZero) return '0';
		if (imZero) return formatScalar(this.re, prec);
		const imAbsStr = formatScalar(Math.abs(this.im), prec);
		const imTerm = imAbsStr === '1' ? 'j' : `j${imAbsStr}`;
		if (reZero) {
			return this.im < 0 ? `-${imTerm}` : imTerm;
		}
		const reStr = formatScalar(this.re, prec);
		const sign = this.im < 0 ? ' - ' : ' + ';
		return `${reStr}${sign}${imTerm}`;
	}

	formatPolar(prec = 4): string {
		const mag = this.abs();
		if (mag < ZERO_EPS) return '0∠0°';
		const deg = this.argDeg();
		const magStr = formatScalar(mag, prec);
		const degStr = formatScalar(Math.abs(deg) < ZERO_EPS ? 0 : deg, prec);
		return `${magStr}∠${degStr}°`;
	}

	toLatexRect(prec = 4): string {
		return this.formatRect(prec);
	}

	toLatexPolar(prec = 4): string {
		const mag = this.abs();
		if (mag < ZERO_EPS) return '0\\angle 0^\\circ';
		const deg = this.argDeg();
		const magStr = formatScalar(mag, prec);
		const degStr = formatScalar(Math.abs(deg) < ZERO_EPS ? 0 : deg, prec);
		return `${magStr}\\angle ${degStr}^\\circ`;
	}
}
