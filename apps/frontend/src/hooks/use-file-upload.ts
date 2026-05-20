import { useState, useCallback, useRef } from 'react';

import { ALLOWED_FILE_MEDIA_TYPES, MAX_FILE_SIZE, MAX_FILES } from '@nao/shared/types';
import type { FileUploadData } from '@nao/shared/types';

export interface UploadedFile {
	id: string;
	file: File;
	dataUrl: string;
	mediaType: string;
	filename: string;
}

const ACCEPTED_TYPES: ReadonlySet<string> = new Set(ALLOWED_FILE_MEDIA_TYPES);

function isAcceptedFileType(type: string): boolean {
	return ACCEPTED_TYPES.has(type);
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

function extractBase64(dataUrl: string): string {
	const idx = dataUrl.indexOf(',');
	return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

export function useFileUpload() {
	const [files, setFiles] = useState<UploadedFile[]>([]);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const addFiles = useCallback(
		async (fileList: FileList | File[]) => {
			const fileArray = Array.from(fileList).filter((f) => isAcceptedFileType(f.type) && f.size <= MAX_FILE_SIZE);

			if (fileArray.length === 0) {
				return;
			}

			const slotsAvailable = MAX_FILES - files.length;
			const filesToProcess = fileArray.slice(0, Math.max(0, slotsAvailable));

			const newFiles: UploadedFile[] = [];
			for (const file of filesToProcess) {
				const dataUrl = await readFileAsDataUrl(file);
				newFiles.push({
					id: crypto.randomUUID(),
					file,
					dataUrl,
					mediaType: file.type,
					filename: file.name,
				});
			}

			if (newFiles.length > 0) {
				setFiles((prev) => [...prev, ...newFiles].slice(0, MAX_FILES));
			}
		},
		[files.length],
	);

	const removeFile = useCallback((id: string) => {
		setFiles((prev) => prev.filter((f) => f.id !== id));
	}, []);

	const clearFiles = useCallback(() => {
		setFiles([]);
	}, []);

	const openFilePicker = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleFileInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (e.target.files) {
				addFiles(e.target.files);
			}
			e.target.value = '';
		},
		[addFiles],
	);

	const handlePaste = useCallback(
		(e: ClipboardEvent) => {
			const items = e.clipboardData?.items;
			if (!items) {
				return;
			}

			const pastedFiles: File[] = [];
			for (const item of items) {
				if (item.kind === 'file' && isAcceptedFileType(item.type)) {
					const file = item.getAsFile();
					if (file) {
						pastedFiles.push(file);
					}
				}
			}

			if (pastedFiles.length > 0) {
				e.preventDefault();
				addFiles(pastedFiles);
			}
		},
		[addFiles],
	);

	const getFilesForUpload = useCallback((): FileUploadData[] => {
		return files.map((f) => ({
			mediaType: f.mediaType,
			data: extractBase64(f.dataUrl),
			filename: f.filename,
		}));
	}, [files]);

	const isImage = useCallback((file: UploadedFile): boolean => {
		return file.mediaType.startsWith('image/');
	}, []);

	return {
		files,
		fileInputRef,
		addFiles,
		removeFile,
		clearFiles,
		openFilePicker,
		handleFileInputChange,
		handlePaste,
		getFilesForUpload,
		isImage,
		hasFiles: files.length > 0,
		canAddMore: files.length < MAX_FILES,
	};
}
