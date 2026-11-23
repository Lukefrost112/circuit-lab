import { describe, expect, it } from 'vitest';
import { Complex } from '../complex';
import { courseSolveDisplay } from './shared';

const c = (re: number) => Complex.from(re, 0);

describe('courseSolveDisplay', () => {
	it('solves a single equation in one line, without a matrix', () => {
		const d = courseSolveDisplay([[c(0.75)]], [c(3)], ['V_{N1}'], 'V', 'dc');
		expect(d.remaining).toBe(1);
		expect(d.matrixLatex).toBeUndefined();
		expect(d.latex.join(' ')).toMatch(/V_{N1} = .* = 4\\text/);
	});

	it('substitutes a mesh current fixed by a current source, then solves the one left', () => {
		// I1 = 2 (current source); 6 I2 - 2 I1 = 8  ->  I2 = 2
		const d = courseSolveDisplay(
			[
				[c(1), c(0)],
				[c(-2), c(6)]
			],
			[c(2), c(8)],
			['I_{m1}', 'I_{m2}'],
			'A',
			'dc'
		);
		expect(d.remaining).toBe(1);
		expect(d.matrixLatex).toBeUndefined();
		expect(d.latex[0]).toBe('I_{m1} = 2\\text{ A}');
		expect(d.latex.at(-1)).toContain('I_{m2} = \\frac{12}{6} = 2');
	});

	it('keeps a (reduced) matrix only when two or more equations remain', () => {
		const d = courseSolveDisplay(
			[
				[c(1), c(0), c(0)],
				[c(0), c(3), c(-1)],
				[c(-1), c(-1), c(4)]
			],
			[c(5), c(2), c(1)],
			['x', 'y', 'z'],
			'V',
			'dc'
		);
		expect(d.remaining).toBe(2);
		expect(d.matrixLatex).toBeDefined();
		expect(d.matrixLatex).not.toMatch(/\{ ?x ?\\\\/);
		expect(d.latex[0]).toBe('x = 5\\text{ V}');
	});
});
