export interface StorageProvider {
	put(key: string, data: Buffer, contentType: string): Promise<void>;
	get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
	delete(key: string): Promise<void>;
	exists(key: string): Promise<boolean>;
}

export type StorageDriver = 'local' | 's3';
