import { FileText, X } from 'lucide-react';

import type { UploadedFile } from '@/hooks/use-file-upload';

interface ChatInputFilePreviewProps {
	files: UploadedFile[];
	onRemove: (id: string) => void;
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilePreviewItem({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
	const isImage = file.mediaType.startsWith('image/');

	if (isImage) {
		return (
			<div className='relative group/preview animate-in fade-in zoom-in-75 duration-200'>
				<img
					src={file.dataUrl}
					alt={file.filename}
					className='size-16 rounded-lg object-cover border border-border'
				/>
				<button
					type='button'
					onClick={onRemove}
					className='absolute -top-1.5 -right-1.5 size-5 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity cursor-pointer'
				>
					<X className='size-3' />
				</button>
			</div>
		);
	}

	return (
		<div className='relative group/preview animate-in fade-in zoom-in-75 duration-200'>
			<div className='flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 max-w-48'>
				<FileText className='size-4 shrink-0 text-muted-foreground' />
				<div className='min-w-0 flex-1'>
					<p className='truncate text-xs font-medium'>{file.filename}</p>
					<p className='text-[10px] text-muted-foreground'>{formatFileSize(file.file.size)}</p>
				</div>
			</div>
			<button
				type='button'
				onClick={onRemove}
				className='absolute -top-1.5 -right-1.5 size-5 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity cursor-pointer'
			>
				<X className='size-3' />
			</button>
		</div>
	);
}

export function ChatInputFilePreview({ files, onRemove }: ChatInputFilePreviewProps) {
	const hasFiles = files.length > 0;

	return (
		<div
			className='grid w-full transition-[grid-template-rows] duration-200 ease-out'
			style={{ gridTemplateRows: hasFiles ? '1fr' : '0fr' }}
		>
			<div className='overflow-hidden'>
				<div className='flex gap-2 px-3 pt-3 pb-1 flex-wrap justify-start'>
					{files.map((file) => (
						<FilePreviewItem key={file.id} file={file} onRemove={() => onRemove(file.id)} />
					))}
				</div>
			</div>
		</div>
	);
}
