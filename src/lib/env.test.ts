import { describe, expect, it } from 'vitest';
import { getSettingsStorageKey, resolveDeployEnv } from './env';

describe('resolveDeployEnv', () => {
	it('resolves staging regardless of casing, whitespace, or isProd flag', () => {
		expect(resolveDeployEnv('staging', false)).toBe('staging');
		expect(resolveDeployEnv('staging', true)).toBe('staging');
		expect(resolveDeployEnv('  STAGING  ', true)).toBe('staging');
		expect(resolveDeployEnv('Staging', false)).toBe('staging');
	});

	it('resolves production when raw is production or isProd is true', () => {
		expect(resolveDeployEnv('production', false)).toBe('production');
		expect(resolveDeployEnv('  PRODUCTION ', false)).toBe('production');
		expect(resolveDeployEnv(undefined, true)).toBe('production');
		expect(resolveDeployEnv('', true)).toBe('production');
		expect(resolveDeployEnv('other', true)).toBe('production');
	});

	it('falls back to development when not staging and not production', () => {
		expect(resolveDeployEnv(undefined, false)).toBe('development');
		expect(resolveDeployEnv('', false)).toBe('development');
		expect(resolveDeployEnv('   ', false)).toBe('development');
		expect(resolveDeployEnv('development', false)).toBe('development');
		expect(resolveDeployEnv('unknown', false)).toBe('development');
		expect(resolveDeployEnv()).toBe('development');
	});
});

describe('getSettingsStorageKey', () => {
	it('uses an isolated storage key for staging', () => {
		expect(getSettingsStorageKey('staging')).toBe('circuit-lab:settings:staging:v1');
	});

	it('preserves the canonical storage key for production and development', () => {
		expect(getSettingsStorageKey('production')).toBe('circuit-lab:settings:v1');
		expect(getSettingsStorageKey('development')).toBe('circuit-lab:settings:v1');
	});
});
