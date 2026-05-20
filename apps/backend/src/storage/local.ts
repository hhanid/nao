import { existsSync, mkdirSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { StorageProvider } from './types';

const METADATA_SUFFIX = '.meta';

export class LocalStorageProvider implements StorageProvider {
	private basePath: string;

	constructor(basePath: string) {
		this.basePath = basePath;
		if (!existsSync(basePath)) {
			mkdirSync(basePath, { recursive: true });
		}
	}

	async put(key: string, data: Buffer, contentType: string): Promise<void> {
		const filePath = this.resolvePath(key);
		const dir = dirname(filePath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		await writeFile(filePath, data);
		await writeFile(filePath + METADATA_SUFFIX, contentType, 'utf-8');
	}

	async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
		const filePath = this.resolvePath(key);
		try {
			const [data, contentType] = await Promise.all([
				readFile(filePath),
				readFile(filePath + METADATA_SUFFIX, 'utf-8'),
			]);
			return { data: Buffer.from(data), contentType };
		} catch {
			return null;
		}
	}

	async delete(key: string): Promise<void> {
		const filePath = this.resolvePath(key);
		try {
			await Promise.all([unlink(filePath), unlink(filePath + METADATA_SUFFIX)]);
		} catch {
			// ignore if file doesn't exist
		}
	}

	async exists(key: string): Promise<boolean> {
		const filePath = this.resolvePath(key);
		return existsSync(filePath);
	}

	private resolvePath(key: string): string {
		return join(this.basePath, key);
	}
}
