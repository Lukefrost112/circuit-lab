import { describe, expect, it } from 'vitest';
import { Complex } from '../complex';
import { matrixToLatex, solveComplexLinearSystem } from '../linalg';

describe('linalg', () => {
	it('solves real and complex systems with partial pivoting (including zero diagonal)', () => {
		// Diagonal entry A[0][0] is 0, forcing partial pivoting row swap
		const A = [
			[Complex.zero(), Complex.from(2, 0), Complex.from(1, 0)],
			[Complex.from(1, 0), Complex.from(-1, 0), Complex.from(1, 0)],
			[Complex.from(2, 0), Complex.from(1, 0), Complex.from(-1, 0)]
		];
		const b = [Complex.from(7, 0), Complex.from(2, 0), Complex.from(1, 0)];

		// Solution: x = [1, 2, 3]
		const res = solveComplexLinearSystem(A, b);
		expect(res.singular).toBe(false);
		expect(res.x[0].equals(Complex.from(1, 0), 1e-12)).toBe(true);
		expect(res.x[1].equals(Complex.from(2, 0), 1e-12)).toBe(true);
		expect(res.x[2].equals(Complex.from(3, 0), 1e-12)).toBe(true);

		// Verify input matrices were not mutated
		expect(A[0][0].isZero()).toBe(true);
		expect(b[0].re).toBe(7);
	});

	it('solves complex AC nodal system accurately', () => {
		// (1 + j1) x0 - j1 x1 = 10
		// -j1 x0 + (2 + j0) x1 = j5
		const A = [
			[Complex.from(1, 1), Complex.from(0, -1)],
			[Complex.from(0, -1), Complex.from(2, 0)]
		];
		const b = [Complex.from(10, 0), Complex.from(0, 5)];

		const res = solveComplexLinearSystem(A, b);
		expect(res.singular).toBe(false);

		// Verify A * x == b
		for (let i = 0; i < 2; i++) {
			const lhs = A[i][0].mul(res.x[0]).add(A[i][1].mul(res.x[1]));
			expect(lhs.equals(b[i], 1e-12)).toBe(true);
		}
	});

	it('detects singular matrices cleanly', () => {
		const A = [
			[Complex.from(1, 0), Complex.from(2, 0)],
			[Complex.from(2, 0), Complex.from(4, 0)]
		];
		const b = [Complex.from(3, 0), Complex.from(6, 0)];

		const res = solveComplexLinearSystem(A, b);
		expect(res.singular).toBe(true);
	});

	it('formats matrix system to KaTeX LaTeX', () => {
		const A = [
			[Complex.from(2, 0), Complex.from(-1, 1)],
			[Complex.from(-1, 1), Complex.from(3, 0)]
		];
		const b = [Complex.from(5, 0), Complex.from(0, 0)];
		const latex = matrixToLatex(A, ['V_{N1}', 'V_{N2}'], b);
		expect(latex).toContain('\\begin{bmatrix}');
		expect(latex).toContain('V_{N1}');
		expect(latex).toContain('-1 + j');
	});
});
