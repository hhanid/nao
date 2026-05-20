import { resolve } from 'node:path';

import { env } from '../env';
import { logger } from '../utils/logger';
import { LocalStorageProvider } from './local';
import { S3StorageProvider } from './s3';
import type { StorageDriver, StorageProvider } from './types';

export type { StorageDriver, StorageProvider } from './types';

function createStorageProvider(): StorageProvider {
	const driver: StorageDriver = env.STORAGE_DRIVER;

	switch (driver) {
		case 's3': {
			if (!env.STORAGE_S3_BUCKET) {
				throw new Error('STORAGE_S3_BUCKET is required when STORAGE_DRIVER=s3');
			}
			logger.info(`File storage: s3 (bucket=${env.STORAGE_S3_BUCKET})`, { source: 'system' });
			return new S3StorageProvider({
				bucket: env.STORAGE_S3_BUCKET,
				region: env.STORAGE_S3_REGION,
				endpoint: env.STORAGE_S3_ENDPOINT,
				accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
				secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
				forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
				prefix: env.STORAGE_S3_PREFIX,
			});
		}
		case 'local':
		default: {
			const storagePath = resolve(env.STORAGE_LOCAL_PATH);
			logger.info(`File storage: local (path=${storagePath})`, { source: 'system' });
			return new LocalStorageProvider(storagePath);
		}
	}
}

export const storage: StorageProvider = createStorageProvider();
