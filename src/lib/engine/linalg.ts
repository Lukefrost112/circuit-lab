/**
 * Complex linear algebra solver (Gaussian elimination with partial pivoting)
 * and LaTeX matrix formatting for MNA systems.
 */

import { Complex } from './complex';

export interface LinearSolveResult {
	x: Complex[];
	singular: boolean;
	pivotMin: number;
}

/**
 * Solves `A * x = b` over the complex field using Gaussian elimination with
 * partial pivoting (maximum-magnitude row pivot).
 * Does not mutate `A` or `b`.
 */
export function solveComplexLinearSystem(A: Complex[][], b: Complex[]): LinearSolveResult {
	const n = A.length;
	if (n === 0 || b.length !== n) {
		return { x: [], singular: n !== 0 || b.length !== n, pivotMin: 0 };
	}

	for (let i = 0; i < n; i++) {
		if (!A[i] || A[i].length !== n) {
			return { x: [], singular: true, pivotMin: 0 };
		}
	}

	// Compute global matrix scale for robust singularity detection
	let maxScale = 0;
	const M: Complex[][] = new Array(n);
	const rhs: Complex[] = new Array(n);
	for (let i = 0; i < n; i++) {
		M[i] = new Array(n);
		for (let j = 0; j < n; j++) {
			const c = A[i][j];
			if (!c.isFinite()) {
				return { x: [], singular: true, pivotMin: 0 };
			}
			const mag = c.abs();
			if (mag > maxScale) maxScale = mag;
			M[i][j] = c;
		}
		if (!b[i].isFinite()) {
			return { x: [], singular: true, pivotMin: 0 };
		}
		rhs[i] = b[i];
	}

	if (maxScale === 0) {
		return { x: new Array(n).fill(Complex.zero()), singular: true, pivotMin: 0 };
	}

	const singularTol = 1e-12 * Math.max(1, maxScale);
	let pivotMin = Infinity;

	// Forward elimination with partial pivoting
	for (let k = 0; k < n; k++) {
		let pivotRow = k;
		let maxAbs = M[k][k].abs();
		for (let i = k + 1; i < n; i++) {
			const cand = M[i][k].abs();
			if (cand > maxAbs) {
				maxAbs = cand;
				pivotRow = i;
			}
		}

		if (maxAbs < pivotMin) {
			pivotMin = maxAbs;
		}

		if (!Number.isFinite(maxAbs) || maxAbs <= singularTol) {
			return {
				x: new Array(n).fill(Complex.zero()),
				singular: true,
				pivotMin: Number.isFinite(pivotMin) ? pivotMin : 0
			};
		}

		if (pivotRow !== k) {
			const tmpRow = M[k];
			M[k] = M[pivotRow];
			M[pivotRow] = tmpRow;

			const tmpRhs = rhs[k];
			rhs[k] = rhs[pivotRow];
			rhs[pivotRow] = tmpRhs;
		}

		const pivot = M[k][k];
		for (let i = k + 1; i < n; i++) {
			if (M[i][k].isZero(1e-15)) continue;
			const factor = M[i][k].div(pivot);
			M[i][k] = Complex.zero();
			for (let j = k + 1; j < n; j++) {
				M[i][j] = M[i][j].sub(factor.mul(M[k][j]));
			}
			rhs[i] = rhs[i].sub(factor.mul(rhs[k]));
		}
	}

	// Back-substitution
	const x: Complex[] = new Array(n);
	for (let i = n - 1; i >= 0; i--) {
		let sum = rhs[i];
		for (let j = i + 1; j < n; j++) {
			sum = sum.sub(M[i][j].mul(x[j]));
		}
		x[i] = sum.div(M[i][i]);
	}

	return {
		x,
		singular: false,
		pivotMin: Number.isFinite(pivotMin) ? pivotMin : 0
	};
}

/**
 * Formats a complex linear system `A * x = b` as a KaTeX-compatible LaTeX equation.
 */
export function matrixToLatex(
	A: Complex[][],
	xLabels: string[],
	b: Complex[],
	prec = 4
): string {
	const rows = A.map((row) => row.map((cell) => cell.toLatexRect(prec)).join(' & ')).join(' \\\\ ');
	const xVec = xLabels.join(' \\\\ ');
	const bVec = b.map((cell) => cell.toLatexRect(prec)).join(' \\\\ ');
	return `\\begin{bmatrix} ${rows} \\end{bmatrix} \\begin{bmatrix} ${xVec} \\end{bmatrix} = \\begin{bmatrix} ${bVec} \\end{bmatrix}`;
}
