/* @license Enterprise */

import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { env, reloadEnv } from '../env';
import { LICENSE_FEATURES } from '../types/license';
import { logger } from '../utils/logger';
import { hasFeature } from './license.service';

/**
 * Pull additional environment variables from AWS Secrets Manager and merge
 * them into `process.env` before the rest of the boot sequence reads it.
 *
 * Configured via `AWS_SECRETS_ENV_IDS` (comma-separated list of secret IDs
 * or full ARNs). Each secret value must be a flat JSON object mapping env
 * var names to string values; the keys are merged into `process.env` with
 * AWS values winning over what was already set locally, so a rotation in
 * AWS is picked up on the next restart without any local change.
 *
 * Gated behind the `sso` enterprise feature: any non-EE install with the
 * env var set logs a warning and skips the fetch entirely.
 */
export async function applyAwsSecretsToEnv(): Promise<void> {
	const secretIds = parseSecretIds(env.AWS_SECRETS_ENV_IDS);
	if (secretIds.length === 0) {
		return;
	}

	if (!(await hasFeature(LICENSE_FEATURES.sso))) {
		logger.warn(
			'AWS_SECRETS_ENV_IDS is set but the SSO enterprise feature is not licensed; skipping AWS Secrets Manager fetch',
			{ source: 'system' },
		);
		return;
	}

	const client = new SecretsManagerClient({
		...(env.AWS_REGION ? { region: env.AWS_REGION } : {}),
	});

	let mergedKeys = 0;
	for (const id of secretIds) {
		const values = await fetchSecretAsObject(client, id);
		if (!values) {
			continue;
		}
		for (const [key, value] of Object.entries(values)) {
			process.env[key] = value;
			mergedKeys++;
		}
	}

	if (mergedKeys > 0) {
		reloadEnv();
		logger.info(`Loaded ${mergedKeys} env var(s) from AWS Secrets Manager`, {
			source: 'system',
			context: { secretIds, mergedKeys },
		});
	}
}

function parseSecretIds(raw: string | undefined): string[] {
	if (!raw) {
		return [];
	}
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

async function fetchSecretAsObject(
	client: SecretsManagerClient,
	secretId: string,
): Promise<Record<string, string> | null> {
	let response;
	try {
		response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error(`Failed to fetch AWS secret '${secretId}': ${message}`, { source: 'system' });
		return null;
	}

	const raw = response.SecretString;
	if (!raw) {
		logger.error(`AWS secret '${secretId}' has no SecretString value`, { source: 'system' });
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error(`AWS secret '${secretId}' is not valid JSON: ${message}`, { source: 'system' });
		return null;
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		logger.error(`AWS secret '${secretId}' must be a JSON object of string-to-string env vars`, {
			source: 'system',
		});
		return null;
	}

	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
		if (typeof value !== 'string') {
			logger.error(`AWS secret '${secretId}' key '${key}' is not a string; skipping`, { source: 'system' });
			continue;
		}
		out[key] = value;
	}
	return out;
}
