import { Loader2 } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ParsedChartBlock, ParsedTableBlock } from '@nao/shared/story-segments';
import type { displayChart } from '@nao/shared/tools';

import { StoryChartEmbedShell } from '@/components/side-panel/story-chart-embed';
import { ChartDisplay } from '@/components/tool-calls/display-chart';
import { TableDisplay } from '@/components/tool-calls/display-table';
import { useStoryFilters } from '@/contexts/story-filters';

export type QueryDataMap = Record<string, { data: Record<string, unknown>[]; columns: string[] }>;

interface LiveQueryConfig {
	queryOptions: (input: { chatId: string; queryId: string }) => object;
	chatId: string;
}

function EmbedPlaceholder({ children }: { children: React.ReactNode }) {
	return (
		<div className='my-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground'>
			{children}
		</div>
	);
}

function EmbedLoading() {
	return (
		<EmbedPlaceholder>
			<span className='flex items-center justify-center'>
				<Loader2 className='size-4 animate-spin mr-2' />
				Loading live data...
			</span>
		</EmbedPlaceholder>
	);
}

function useLiveQueryData(queryId: string, liveQuery?: LiveQueryConfig) {
	return useQuery({
		queryKey: ['noop', queryId],
		queryFn: () => null,
		enabled: false,
		...(liveQuery ? liveQuery.queryOptions({ chatId: liveQuery.chatId, queryId }) : {}),
		...(liveQuery ? { staleTime: 0, enabled: true } : {}),
	});
}

export const StoryChartEmbed = memo(function StoryChartEmbed({
	chart,
	queryData,
	liveQuery,
}: {
	chart: ParsedChartBlock;
	queryData?: QueryDataMap | null;
	liveQuery?: LiveQueryConfig;
}) {
	const noCacheFetch = useLiveQueryData(chart.queryId, liveQuery);
	const filters = useStoryFilters();

	const resolved = liveQuery
		? (noCacheFetch.data as { data: Record<string, unknown>[]; columns: string[] } | undefined)
		: queryData?.[chart.queryId];
	const resolvedData = resolved?.data;
	const resolvedColumns = useMemo(() => resolved?.columns ?? [], [resolved?.columns]);

	const filteredData = useMemo(() => {
		if (!resolvedData) {
			return null;
		}
		return filters ? filters.applyToRows(chart.queryId, resolvedColumns, resolvedData) : resolvedData;
	}, [filters, chart.queryId, resolvedColumns, resolvedData]);

	if (liveQuery && noCacheFetch.isLoading) {
		return <EmbedLoading />;
	}

	if (!filteredData || filteredData.length === 0) {
		return <EmbedPlaceholder>Chart data unavailable</EmbedPlaceholder>;
	}

	if (chart.series.length === 0) {
		return <EmbedPlaceholder>No series configured for chart</EmbedPlaceholder>;
	}

	return (
		<StoryChartEmbedShell chart={chart} availableColumns={resolvedColumns}>
			<ChartDisplay
				data={filteredData}
				chartType={chart.chartType as displayChart.ChartType}
				xAxisKey={chart.xAxisKey}
				xAxisType={chart.xAxisType === 'number' ? 'number' : 'category'}
				series={chart.series}
				title={chart.title}
			/>
		</StoryChartEmbedShell>
	);
});

export const StoryTableEmbed = memo(function StoryTableEmbed({
	table,
	queryData,
	liveQuery,
}: {
	table: ParsedTableBlock;
	queryData?: QueryDataMap | null;
	liveQuery?: LiveQueryConfig;
}) {
	const noCacheFetch = useLiveQueryData(table.queryId, liveQuery);
	const filters = useStoryFilters();

	const resolvedResult = liveQuery
		? (noCacheFetch.data as { data: Record<string, unknown>[]; columns: string[] } | undefined)
		: queryData?.[table.queryId];

	const filteredRows = useMemo(() => {
		if (!resolvedResult?.data) {
			return null;
		}
		return filters
			? filters.applyToRows(table.queryId, resolvedResult.columns ?? [], resolvedResult.data)
			: resolvedResult.data;
	}, [filters, table.queryId, resolvedResult?.data, resolvedResult?.columns]);

	if (liveQuery && noCacheFetch.isLoading) {
		return <EmbedLoading />;
	}

	if (!filteredRows) {
		return <EmbedPlaceholder>Table data unavailable</EmbedPlaceholder>;
	}

	return (
		<TableDisplay
			data={filteredRows}
			columns={resolvedResult?.columns ?? []}
			title={table.title}
			tableContainerClassName='max-h-[28rem]'
		/>
	);
});
