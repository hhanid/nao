import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';

import type { StorageProvider } from './types';

export interface S3StorageOptions {
	bucket: string;
	region?: string;
	endpoint?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	forcePathStyle?: boolean;
	prefix?: string;
}

export class S3StorageProvider implements StorageProvider {
	private client: S3Client;
	private bucket: string;
	private prefix: string;

	constructor(opts: S3StorageOptions) {
		this.bucket = opts.bucket;
		this.prefix = opts.prefix ?? '';

		this.client = new S3Client({
			region: opts.region ?? 'us-east-1',
			...(opts.endpoint && { endpoint: opts.endpoint }),
			...(opts.forcePathStyle && { forcePathStyle: true }),
			...(opts.accessKeyId &&
				opts.secretAccessKey && {
					credentials: {
						accessKeyId: opts.accessKeyId,
						secretAccessKey: opts.secretAccessKey,
					},
				}),
		});
	}

	async put(key: string, data: Buffer, contentType: string): Promise<void> {
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: this.resolveKey(key),
				Body: data,
				ContentType: contentType,
			}),
		);
	}

	async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
		try {
			const response = await this.client.send(
				new GetObjectCommand({
					Bucket: this.bucket,
					Key: this.resolveKey(key),
				}),
			);
			const bytes = await response.Body?.transformToByteArray();
			if (!bytes) {
				return null;
			}
			return {
				data: Buffer.from(bytes),
				contentType: response.ContentType ?? 'application/octet-stream',
			};
		} catch (err: unknown) {
			if (isNoSuchKeyError(err)) {
				return null;
			}
			throw err;
		}
	}

	async delete(key: string): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({
				Bucket: this.bucket,
				Key: this.resolveKey(key),
			}),
		);
	}

	async exists(key: string): Promise<boolean> {
		try {
			await this.client.send(
				new HeadObjectCommand({
					Bucket: this.bucket,
					Key: this.resolveKey(key),
				}),
			);
			return true;
		} catch (err: unknown) {
			if (isNoSuchKeyError(err)) {
				return false;
			}
			throw err;
		}
	}

	private resolveKey(key: string): string {
		return this.prefix ? `${this.prefix}/${key}` : key;
	}
}

function isNoSuchKeyError(err: unknown): boolean {
	if (typeof err !== 'object' || err === null) {
		return false;
	}
	const name = (err as { name?: string }).name;
	return name === 'NoSuchKey' || name === 'NotFound' || name === '404';
}
