import {
	collectFilterSegments,
	isActiveFilterValue,
	matchFilter,
	splitCodeIntoSegments,
} from '@nao/shared/story-segments';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ParsedFilterBlock } from '@nao/shared/story-segments';

const URL_PARAM_PREFIX = 'f_';

export type FilterValue = string | string[];

export interface StoryFiltersState {
	filters: ParsedFilterBlock[];
	values: Record<string, FilterValue>;
	setValue: (filterId: string, value: FilterValue) => void;
	resetAll: () => void;
	hasActiveFilters: boolean;
	applyToRows: (
		queryId: string,
		columns: readonly string[],
		rows: readonly Record<string, unknown>[],
	) => Record<string, unknown>[];
	deriveOptionsFor: (
		filter: ParsedFilterBlock,
		queryData: Record<string, { data: readonly unknown[]; columns: readonly string[] }> | null | undefined,
	) => string[];
}

const StoryFiltersContext = createContext<StoryFiltersState | null>(null);

export const useStoryFilters = () => useContext(StoryFiltersContext);

interface StoryFiltersProviderProps {
	storyCode: string;
	/** Optional namespace used in URL params so multiple stories can coexist on the same URL. */
	storyKey?: string;
	enableUrlSync?: boolean;
	children: React.ReactNode;
}

export function StoryFiltersProvider({
	storyCode,
	storyKey,
	enableUrlSync = true,
	children,
}: StoryFiltersProviderProps) {
	const filters = useMemo(() => collectFilterSegments(splitCodeIntoSegments(storyCode)), [storyCode]);
	const paramPrefix = useMemo(() => `${URL_PARAM_PREFIX}${storyKey ? `${storyKey}_` : ''}`, [storyKey]);

	const [values, setValues] = useState<Record<string, FilterValue>>(() => initialValues(filters, paramPrefix));

	useEffect(() => {
		setValues(initialValues(filters, paramPrefix));
	}, [filters, paramPrefix]);

	useEffect(() => {
		if (!enableUrlSync || typeof window === 'undefined') {
			return;
		}
		syncValuesToUrl(values, paramPrefix);
	}, [values, paramPrefix, enableUrlSync]);

	const setValue = useCallback((filterId: string, value: FilterValue) => {
		setValues((prev) => ({ ...prev, [filterId]: value }));
	}, []);

	const resetAll = useCallback(() => {
		setValues(defaultValues(filters));
	}, [filters]);

	const hasActiveFilters = useMemo(() => filters.some((f) => isActiveFilterValue(values[f.id])), [filters, values]);

	const applyToRows = useCallback<StoryFiltersState['applyToRows']>(
		(queryId, columns, rows) => {
			const applicable = filters.filter(
				(f) =>
					(!f.applyTo || f.applyTo.includes(queryId)) &&
					columns.includes(f.field) &&
					isActiveFilterValue(values[f.id]),
			);
			if (applicable.length === 0) {
				return rows as Record<string, unknown>[];
			}
			return rows.filter((row) => applicable.every((f) => matchFilter(f, values[f.id], row)));
		},
		[filters, values],
	);

	const deriveOptionsFor = useCallback<StoryFiltersState['deriveOptionsFor']>((filter, queryData) => {
		if (filter.values && filter.values.length > 0) {
			return filter.values;
		}
		if (!queryData) {
			return [];
		}
		const targetQueryIds = filter.applyTo
			? Object.keys(queryData).filter((qid) => filter.applyTo!.includes(qid))
			: Object.keys(queryData);
		const seen = new Set<string>();
		for (const queryId of targetQueryIds) {
			const result = queryData[queryId];
			if (!result?.columns?.includes(filter.field)) {
				continue;
			}
			for (const row of result.data as Record<string, unknown>[]) {
				const cell = row?.[filter.field];
				if (cell === null || cell === undefined) {
					continue;
				}
				const str = String(cell);
				if (str.length > 0) {
					seen.add(str);
				}
			}
		}
		return [...seen].sort((a, b) => a.localeCompare(b));
	}, []);

	const value = useMemo<StoryFiltersState>(
		() => ({
			filters,
			values,
			setValue,
			resetAll,
			hasActiveFilters,
			applyToRows,
			deriveOptionsFor,
		}),
		[filters, values, setValue, resetAll, hasActiveFilters, applyToRows, deriveOptionsFor],
	);

	return <StoryFiltersContext.Provider value={value}>{children}</StoryFiltersContext.Provider>;
}

function initialValues(filters: ParsedFilterBlock[], paramPrefix: string): Record<string, FilterValue> {
	const fromUrl = readValuesFromUrl(paramPrefix);
	const result: Record<string, FilterValue> = {};
	for (const filter of filters) {
		const urlValue = fromUrl[filter.id];
		if (urlValue !== undefined) {
			result[filter.id] = filter.type === 'multi-select' ? splitCsv(urlValue) : urlValue;
			continue;
		}
		result[filter.id] = parseDefault(filter);
	}
	return result;
}

function defaultValues(filters: ParsedFilterBlock[]): Record<string, FilterValue> {
	const result: Record<string, FilterValue> = {};
	for (const filter of filters) {
		result[filter.id] = parseDefault(filter);
	}
	return result;
}

function parseDefault(filter: ParsedFilterBlock): FilterValue {
	if (filter.type === 'multi-select') {
		return filter.default ? splitCsv(filter.default) : [];
	}
	return filter.default ?? '';
}

function readValuesFromUrl(paramPrefix: string): Record<string, string> {
	if (typeof window === 'undefined') {
		return {};
	}
	const params = new URLSearchParams(window.location.search);
	const result: Record<string, string> = {};
	params.forEach((value, key) => {
		if (key.startsWith(paramPrefix)) {
			result[key.slice(paramPrefix.length)] = value;
		}
	});
	return result;
}

function syncValuesToUrl(values: Record<string, FilterValue>, paramPrefix: string): void {
	const params = new URLSearchParams(window.location.search);
	for (const key of Array.from(params.keys())) {
		if (key.startsWith(paramPrefix)) {
			params.delete(key);
		}
	}
	for (const [id, value] of Object.entries(values)) {
		if (!isActiveFilterValue(value)) {
			continue;
		}
		const serialized = Array.isArray(value) ? value.join(',') : value;
		params.set(`${paramPrefix}${id}`, serialized);
	}
	const search = params.toString();
	const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
	window.history.replaceState(null, '', next);
}

function splitCsv(value: string): string[] {
	return value
		.split(',')
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
}
