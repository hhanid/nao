import type { FileUploadData, ImageUploadData } from '@nao/shared/types';

import { noProjectMessage } from '../env';
import * as chatQueries from '../queries/chat.queries';
import * as imageQueries from '../queries/image.queries';
import { agentService } from '../services/agent';
import { mcpService } from '../services/mcp';
import { skillService } from '../services/skill';
import { AgentRequest, AgentRequestUserMessage, UIMessagePart } from '../types/chat';
import { createChatTitle } from '../utils/ai';
import { HandlerError } from '../utils/error';
import { buildImageUrl } from '../utils/image';

interface HandleAgentMessageInput extends AgentRequest {
	userId: string;
	projectId: string | undefined;
}

interface HandleAgentMessageResult {
	chatId: string;
	isNewChat: boolean;
	modelId: string;
	stream: ReadableStream;
}

export const handleAgentRoute = async (opts: HandleAgentMessageInput): Promise<HandleAgentMessageResult> => {
	const { userId, message, messageToEditId, model, mentions, projectId } = opts;

	if (!projectId) {
		throw new HandlerError('BAD_REQUEST', noProjectMessage());
	}

	await agentService.assertBudget(projectId, model);

	let chatId = opts.chatId;
	const isNewChat = !chatId;
	let newMessageId: string;

	if (!chatId) {
		const fileParts = await saveAndBuildFileParts(message.images, message.files);
		const [createdChat, createdMessage] = await createChat(userId, projectId, message, fileParts);
		chatId = createdChat.id;
		newMessageId = createdMessage.id;
	} else {
		const { messageId } = await insertOrSupersedeMessage({
			userId,
			chatId,
			message,
			messageToEditId,
		});
		newMessageId = messageId;
	}

	const [chat] = await chatQueries.getChat(chatId);
	if (!chat) {
		throw new HandlerError('NOT_FOUND', `Chat with id ${chatId} not found.`);
	}

	await mcpService.initializeMcpState(projectId);
	await skillService.initializeSkills(projectId);

	const agent = await agentService.create({ ...chat, userId, projectId }, model);

	const isForkedFirstMessage =
		!isNewChat && !!chat.forkMetadata && chat.messages.filter((m) => m.role === 'user' && !m.isForked).length === 1;

	const shouldEmitNewChat = isNewChat || isForkedFirstMessage;

	const stream = agent.stream(chat.messages, {
		mentions,
		timezone: opts.timezone,
		events: {
			newChat: shouldEmitNewChat
				? {
						id: chatId,
						projectId,
						title: chat.title,
						isStarred: chat.isStarred,
						createdAt: chat.createdAt,
						updatedAt: chat.updatedAt,
					}
				: undefined,
			newUserMessage: { newId: newMessageId },
		},
	});

	return {
		chatId,
		isNewChat,
		modelId: agent.getModelId(),
		stream,
	};
};

async function saveAndBuildFileParts(
	images: ImageUploadData[] | undefined,
	files: FileUploadData[] | undefined,
): Promise<UIMessagePart[]> {
	const parts: UIMessagePart[] = [];

	if (images?.length) {
		const savedImages = await imageQueries.saveImages(images);
		for (const { id, mediaType } of savedImages) {
			parts.push({ type: 'file' as const, mediaType, url: buildImageUrl(id) });
		}
	}

	if (files?.length) {
		const savedFiles = await imageQueries.saveImages(files.map((f) => ({ mediaType: f.mediaType, data: f.data })));
		for (const { id, mediaType } of savedFiles) {
			parts.push({ type: 'file' as const, mediaType, url: buildImageUrl(id) });
		}
	}

	return parts;
}

const createChat = async (
	userId: string,
	projectId: string,
	message: AgentRequestUserMessage,
	fileParts: UIMessagePart[],
) => {
	const title = createChatTitle(message);
	return await chatQueries.createChat(
		{ title, userId, projectId },
		{ text: message.text, citation: message.citation },
		fileParts,
	);
};

/** Insert a message into a chat or supersede an existing message when it is edited. */
const insertOrSupersedeMessage = async (opts: {
	userId: string;
	chatId: string;
	message: AgentRequestUserMessage;
	messageToEditId?: string;
}) => {
	const { userId, chatId, message, messageToEditId } = opts;
	const ownerId = await chatQueries.getChatOwnerId(chatId);
	if (!ownerId) {
		throw new HandlerError('NOT_FOUND', `Chat with id ${chatId} not found.`);
	}
	if (ownerId !== userId) {
		throw new HandlerError('FORBIDDEN', 'You are not authorized to access this chat.');
	}

	const fileParts = await saveAndBuildFileParts(message.images, message.files);

	if (messageToEditId) {
		await chatQueries.supersedeMessagesFrom(chatId, messageToEditId);
	}
	return chatQueries.upsertMessage({
		role: 'user',
		parts: [{ type: 'text', text: message.text }, ...fileParts],
		chatId,
		source: 'web',
		citation: message.citation,
	});
};
