import { z } from 'zod/v4';

import type { App } from '../app';
import { getFileBuffer } from '../queries/image.queries';
import { HandlerError } from '../utils/error';

const paramsSchema = z.object({
	imageId: z.string().uuid(),
});

export const imageRoutes = async (app: App) => {
	app.get('/:imageId', { schema: { params: paramsSchema } }, async (request, reply) => {
		const { imageId } = request.params;

		const file = await getFileBuffer(imageId);
		if (!file) {
			throw new HandlerError('NOT_FOUND', 'File not found');
		}

		reply.header('Content-Type', file.mediaType);
		reply.header('Cache-Control', 'public, max-age=31536000, immutable');

		if (!file.mediaType.startsWith('image/')) {
			reply.header('Content-Disposition', 'inline');
		}

		return reply.send(file.data);
	});
};
