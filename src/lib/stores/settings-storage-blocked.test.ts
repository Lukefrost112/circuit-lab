import { afterEach, describe, expect, it, vi } from 'vitest';

describe('settings store with blocked site data', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it('loads defaults instead of throwing when reading localStorage throws', async () => {
		const blockedWindow = {};
		Object.defineProperty(blockedWindow, 'localStorage', {
			get() {
				throw new DOMException('The operation is insecure.', 'SecurityError');
			}
		});
		vi.stubGlobal('window', blockedWindow);
		vi.resetModules();
		const { settings } = await import('./settings.svelte');
		expect(settings.unitSystem).toBeDefined();
		expect(() => {
			settings.unitSystem = 'kohm-v-ma';
		}).not.toThrow();
	});
});
