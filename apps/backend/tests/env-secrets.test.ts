import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
const clientCtorMock = vi.fn();
const hasFeatureMock = vi.fn();

vi.mock('@aws-sdk/client-secrets-manager', () => ({
	SecretsManagerClient: vi.fn().mockImplementation(function (this: object, config: unknown) {
		clientCtorMock(config);
		return { send: sendMock };
	}),
	GetSecretValueCommand: vi.fn().mockImplementation(function (this: object, input: unknown) {
		return { input };
	}),
}));

vi.mock('../src/services/license.service', () => ({
	hasFeature: (...args: unknown[]) => hasFeatureMock(...args),
	LICENSE_FEATURES: { sso: 'sso', whiteLabel: 'white-label' },
}));

vi.mock('../src/utils/logger', () => ({
	logger: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	},
}));

import { env, reloadEnv } from '../src/env';
import { applyAwsSecretsToEnv } from '../src/services/env-secrets';
import { logger } from '../src/utils/logger';

describe('env-secrets', () => {
	let originalEnv: typeof process.env;

	beforeEach(() => {
		originalEnv = { ...process.env };
		sendMock.mockReset();
		clientCtorMock.mockReset();
		hasFeatureMock.mockReset();
		vi.mocked(logger.error).mockClear();
		vi.mocked(logger.warn).mockClear();
		vi.mocked(logger.info).mockClear();
	});

	afterEach(() => {
		process.env = originalEnv;
		reloadEnv();
	});

	it('is a no-op when AWS_SECRETS_ENV_IDS is unset', async () => {
		delete process.env.AWS_SECRETS_ENV_IDS;
		reloadEnv();

		await applyAwsSecretsToEnv();

		expect(clientCtorMock).not.toHaveBeenCalled();
		expect(sendMock).not.toHaveBeenCalled();
		expect(hasFeatureMock).not.toHaveBeenCalled();
	});

	it('skips fetch and warns when SSO feature is not licensed', async () => {
		process.env.AWS_SECRETS_ENV_IDS = 'prod/nao';
		reloadEnv();
		hasFeatureMock.mockResolvedValue(false);

		await applyAwsSecretsToEnv();

		expect(hasFeatureMock).toHaveBeenCalledWith('sso');
		expect(sendMock).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('SSO enterprise feature is not licensed'), {
			source: 'system',
		});
	});

	it('merges keys from a single secret into process.env and reloads env', async () => {
		process.env.AWS_SECRETS_ENV_IDS = 'prod/nao';
		process.env.AWS_REGION = 'eu-west-1';
		reloadEnv();
		hasFeatureMock.mockResolvedValue(true);
		sendMock.mockResolvedValue({
			SecretString: JSON.stringify({
				AZURE_AD_CLIENT_ID: 'client-from-aws',
				AZURE_AD_CLIENT_SECRET: 'secret-from-aws',
			}),
		});

		await applyAwsSecretsToEnv();

		expect(clientCtorMock).toHaveBeenCalledWith({ region: 'eu-west-1' });
		expect(process.env.AZURE_AD_CLIENT_ID).toBe('client-from-aws');
		expect(process.env.AZURE_AD_CLIENT_SECRET).toBe('secret-from-aws');
		expect(env.AZURE_AD_CLIENT_ID).toBe('client-from-aws');
		expect(env.AZURE_AD_CLIENT_SECRET).toBe('secret-from-aws');
	});

	it('overrides existing process.env values with AWS values (rotate-wins)', async () => {
		process.env.AWS_SECRETS_ENV_IDS = 'prod/nao';
		process.env.AZURE_AD_CLIENT_ID = 'local-stale-value';
		reloadEnv();
		hasFeatureMock.mockResolvedValue(true);
		sendMock.mockResolvedValue({
			SecretString: JSON.stringify({ AZURE_AD_CLIENT_ID: 'fresh-from-aws' }),
		});

		await applyAwsSecretsToEnv();

		expect(env.AZURE_AD_CLIENT_ID).toBe('fresh-from-aws');
	});

	it('merges keys from multiple secrets in order', async () => {
		process.env.AWS_SECRETS_ENV_IDS = 'prod/sso,prod/smtp';
		reloadEnv();
		hasFeatureMock.mockResolvedValue(true);
		sendMock
			.mockResolvedValueOnce({ SecretString: JSON.stringify({ AZURE_AD_CLIENT_ID: 'azure-id' }) })
			.mockResolvedValueOnce({ SecretString: JSON.stringify({ SMTP_HOST: 'smtp.example.com' }) });

		await applyAwsSecretsToEnv();

		expect(env.AZURE_AD_CLIENT_ID).toBe('azure-id');
		expect(env.SMTP_HOST).toBe('smtp.example.com');
		expect(sendMock).toHaveBeenCalledTimes(2);
	});

	it('continues with the remaining secrets after a fetch failure', async () => {
		process.env.AWS_SECRETS_ENV_IDS = 'missing/one,prod/two';
		reloadEnv();
		hasFeatureMock.mockResolvedValue(true);
		sendMock
			.mockRejectedValueOnce(new Error('ResourceNotFoundException'))
			.mockResolvedValueOnce({ SecretString: JSON.stringify({ SMTP_HOST: 'survived' }) });

		await applyAwsSecretsToEnv();

		expect(env.SMTP_HOST).toBe('survived');
		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining("Failed to fetch AWS secret 'missing/one'"),
			expect.anything(),
		);
	});

	it('logs an error and skips secrets whose value is not a JSON object', async () => {
		process.env.AWS_SECRETS_ENV_IDS = 'prod/nao';
		reloadEnv();
		hasFeatureMock.mockResolvedValue(true);
		sendMock.mockResolvedValue({ SecretString: '"plain-string"' });

		await applyAwsSecretsToEnv();

		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('must be a JSON object'), expect.anything());
	});

	it('skips non-string values inside an otherwise valid secret', async () => {
		process.env.AWS_SECRETS_ENV_IDS = 'prod/nao';
		reloadEnv();
		hasFeatureMock.mockResolvedValue(true);
		sendMock.mockResolvedValue({
			SecretString: JSON.stringify({
				GOOD_KEY: 'good',
				BAD_KEY: 42,
			}),
		});

		await applyAwsSecretsToEnv();

		expect(process.env.GOOD_KEY).toBe('good');
		expect(process.env.BAD_KEY).toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining("key 'BAD_KEY' is not a string"),
			expect.anything(),
		);
	});

	it('trims whitespace and ignores empty entries in the comma-separated list', async () => {
		process.env.AWS_SECRETS_ENV_IDS = '  prod/sso  ,, ,prod/smtp ';
		reloadEnv();
		hasFeatureMock.mockResolvedValue(true);
		sendMock
			.mockResolvedValueOnce({ SecretString: JSON.stringify({ AZURE_AD_CLIENT_ID: 'azure-id' }) })
			.mockResolvedValueOnce({ SecretString: JSON.stringify({ SMTP_HOST: 'smtp.example.com' }) });

		await applyAwsSecretsToEnv();

		expect(sendMock).toHaveBeenCalledTimes(2);
	});
});
