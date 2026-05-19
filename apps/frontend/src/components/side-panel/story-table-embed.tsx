import { memo, useMemo } from 'react';
import type { UIMessage } from '@nao/backend/chat';
import type { ParsedTableBlock } from '@nao/shared/story-segments';

import { TableDisplay } from '@/components/tool-calls/display-table';
import { useOptionalAgentContext } from '@/contexts/agent.provider';
import { useStoryFilters } from '@/contexts/story-filters';

export const StoryTableEmbed = memo(function StoryTableEmbed({ table }: { table: ParsedTableBlock }) {
	const agent = useOptionalAgentContext();
	const filters = useStoryFilters();

	const sourceData = useMemo(() => {
		const findInMessages = (messages: UIMessage[]) => {
			for (const message of messages) {
				for (const part of message.parts) {
					if (part.type === 'tool-execute_sql' && part.output?.id === table.queryId) {
						return part.output;
					}
				}
			}
			return null;
		};

		return findInMessages(agent?.messages ?? []);
	}, [agent?.messages, table.queryId]);

	const filteredRows = useMemo(() => {
		if (!sourceData?.data || !Array.isArray(sourceData.data)) {
			return null;
		}
		const rows = sourceData.data as Record<string, unknown>[];
		return filters ? filters.applyToRows(table.queryId, sourceData.columns ?? [], rows) : rows;
	}, [sourceData?.data, sourceData?.columns, table.queryId, filters]);

	if (!filteredRows) {
		return (
			<div className='my-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground'>
				Table data unavailable (query: {table.queryId})
			</div>
		);
	}

	return (
		<TableDisplay
			data={filteredRows}
			columns={sourceData?.columns ?? []}
			title={table.title}
			tableContainerClassName='max-h-[28rem]'
		/>
	);
});
