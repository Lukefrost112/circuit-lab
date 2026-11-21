import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
	it('merges conditional classes and resolves Tailwind conflicts', () => {
		const isMuted = false;
		expect(cn('px-2 py-1 text-sm', isMuted && 'opacity-50', 'px-4')).toBe('py-1 text-sm px-4');
	});
});
