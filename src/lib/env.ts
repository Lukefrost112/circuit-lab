export type DeployEnv = 'production' | 'staging' | 'development';

export function resolveDeployEnv(raw?: string, isProd = false): DeployEnv {
	const normalized = raw?.trim().toLowerCase();
	if (normalized === 'staging') return 'staging';
	if (normalized === 'production' || isProd) return 'production';
	return 'development';
}

export function getSettingsStorageKey(env: DeployEnv): string {
	return env === 'staging' ? 'circuit-lab:settings:staging:v1' : 'circuit-lab:settings:v1';
}

export const DEPLOY_ENV: DeployEnv = resolveDeployEnv(
	import.meta.env.VITE_DEPLOY_ENV as string | undefined,
	Boolean(import.meta.env.PROD)
);

export const IS_STAGING: boolean = DEPLOY_ENV === 'staging';

export const DEPLOY_COMMIT_SHA: string | undefined =
	(import.meta.env.VITE_COMMIT_SHA as string | undefined)?.trim() || undefined;
