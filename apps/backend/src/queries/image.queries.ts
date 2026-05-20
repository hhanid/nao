import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import s from '../db/abstractSchema';
import { db } from '../db/db';
import { storage } from '../storage';

export interface ChatImage {
	id: string;
	data: string;
	mediaType: string;
}

export const getImagesByChatId = async (chatId: string): Promise<ChatImage[]> => {
	const rows = await db
		.select({
			id: s.messageImage.id,
			mediaType: s.messageImage.mediaType,
		})
		.from(s.messagePart)
		.innerJoin(s.chatMessage, eq(s.messagePart.messageId, s.chatMessage.id))
		.innerJoin(s.messageImage, eq(s.messagePart.imageId, s.messageImage.id))
		.where(
			and(eq(s.chatMessage.chatId, chatId), isNotNull(s.messagePart.imageId), isNull(s.chatMessage.supersededAt)),
		)
		.execute();

	const results: ChatImage[] = [];
	for (const row of rows) {
		const file = await storage.get(row.id);
		if (file) {
			results.push({
				id: row.id,
				data: file.data.toString('base64'),
				mediaType: row.mediaType,
			});
		}
	}
	return results;
};

export const saveImage = async (image: { mediaType: string; data: string }): Promise<{ id: string }> => {
	const [row] = await db
		.insert(s.messageImage)
		.values({ mediaType: image.mediaType })
		.returning({ id: s.messageImage.id })
		.execute();

	await storage.put(row.id, Buffer.from(image.data, 'base64'), image.mediaType);
	return row;
};

export const saveImages = async (
	images: { mediaType: string; data: string }[],
): Promise<{ id: string; mediaType: string }[]> => {
	if (images.length === 0) {
		return [];
	}

	const rows = await db
		.insert(s.messageImage)
		.values(images.map((img) => ({ mediaType: img.mediaType })))
		.returning({ id: s.messageImage.id, mediaType: s.messageImage.mediaType })
		.execute();

	await Promise.all(rows.map((row, i) => storage.put(row.id, Buffer.from(images[i].data, 'base64'), row.mediaType)));

	return rows;
};

export const getImageById = async (id: string): Promise<{ data: string; mediaType: string } | undefined> => {
	const [row] = await db
		.select({ mediaType: s.messageImage.mediaType })
		.from(s.messageImage)
		.where(eq(s.messageImage.id, id))
		.execute();

	if (!row) {
		return undefined;
	}

	const file = await storage.get(id);
	if (!file) {
		return undefined;
	}

	return { data: file.data.toString('base64'), mediaType: row.mediaType };
};

export const getFileBuffer = async (id: string): Promise<{ data: Buffer; mediaType: string } | undefined> => {
	const [row] = await db
		.select({ mediaType: s.messageImage.mediaType })
		.from(s.messageImage)
		.where(eq(s.messageImage.id, id))
		.execute();

	if (!row) {
		return undefined;
	}

	const file = await storage.get(id);
	if (!file) {
		return undefined;
	}

	return { data: file.data, mediaType: row.mediaType };
};
