import type { MentionOption } from 'prompt-mentions';
import type { FileUploadData, ImageUploadData } from '@nao/shared/types';

export interface QueuedMessage {
	id: string;
	text: string;
	mentions: MentionOption[];
	images?: ImageUploadData[];
	files?: FileUploadData[];
}

export type NewQueuedMessage = Omit<QueuedMessage, 'id'>;
