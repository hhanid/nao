export interface ParsedChartBlock {
	queryId: string;
	chartType: string;
	xAxisKey: string;
	xAxisType: string | null;
	series: Array<{ data_key: string; color: string; label?: string }>;
	title: string;
	/** The original `<chart ... />` tag this block was parsed from, when available. */
	rawTag?: string;
}

export interface ParsedTableBlock {
	queryId: string;
	title: string;
}

export type FilterType = 'select' | 'multi-select' | 'text';

export interface ParsedFilterBlock {
	id: string;
	label: string;
	field: string;
	type: FilterType;
	/** Static option list provided by the author. When omitted, options are derived from row data. */
	values: string[] | null;
	/** Initial value(s). For multi-select this can be a comma-separated list; "all" / "" means no filter. */
	default: string;
	/** When set, restricts which query_ids this filter scopes to. Otherwise applies to every query containing `field`. */
	applyTo: string[] | null;
	/** The original `<filter ... />` tag this block was parsed from, when available. */
	rawTag?: string;
}

export type Segment =
	| { type: 'markdown'; content: string }
	| { type: 'chart'; chart: ParsedChartBlock }
	| { type: 'table'; table: ParsedTableBlock }
	| { type: 'filter'; filter: ParsedFilterBlock }
	| { type: 'grid'; cols: number; children: Segment[] };

function unescapeAttributeValue(value: string): string {
	return value.replace(/\\(["'\\])/g, '$1');
}

export function parseChartAttributes(attrString: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const attrRegex = /(\w+)=(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/g;
	let match;
	while ((match = attrRegex.exec(attrString)) !== null) {
		attrs[match[1]] = unescapeAttributeValue(match[2] ?? match[3] ?? '');
	}
	return attrs;
}

export function parseChartBlock(attrString: string): ParsedChartBlock | null {
	const attrs = parseChartAttributes(attrString);
	if (!attrs.query_id || !attrs.chart_type || !attrs.x_axis_key) {
		return null;
	}

	const series: ParsedChartBlock['series'] = [];
	if (attrs.series) {
		const parsed = tryParseSeriesJson(attrs.series) ?? extractSeriesFromRawAttrs(attrString);
		if (parsed) {
			series.push(...parsed);
		}
	} else if (attrs.data_key) {
		series.push({
			data_key: attrs.data_key,
			color: attrs.color || 'var(--chart-1)',
			label: attrs.label,
		});
	}

	return {
		queryId: attrs.query_id,
		chartType: attrs.chart_type,
		xAxisKey: attrs.x_axis_key,
		xAxisType: attrs.x_axis_type || null,
		series,
		title: attrs.title || '',
	};
}

const escapeDoubleQuotedAttr = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const escapeSingleQuotedAttr = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Serializes a chart config into its `<chart ... />` tag representation used in story markdown. */
export function buildChartTag(config: {
	query_id: string;
	chart_type: string;
	x_axis_key: string;
	x_axis_type: string | null;
	series: Array<{ data_key: string; color?: string; label?: string }>;
	title: string;
}): string {
	const seriesJson = JSON.stringify(config.series);
	return `<chart query_id="${escapeDoubleQuotedAttr(config.query_id)}" chart_type="${escapeDoubleQuotedAttr(
		config.chart_type,
	)}" x_axis_key="${escapeDoubleQuotedAttr(config.x_axis_key)}" x_axis_type="${escapeDoubleQuotedAttr(
		config.x_axis_type ?? '',
	)}" series='${escapeSingleQuotedAttr(seriesJson)}' title="${escapeDoubleQuotedAttr(config.title ?? '')}" />`;
}

const VALID_FILTER_TYPES: ReadonlySet<FilterType> = new Set<FilterType>(['select', 'multi-select', 'text']);

export function parseFilterBlock(attrString: string): ParsedFilterBlock | null {
	const attrs = parseChartAttributes(attrString);
	if (!attrs.id || !attrs.field) {
		return null;
	}
	const type: FilterType = VALID_FILTER_TYPES.has(attrs.type as FilterType) ? (attrs.type as FilterType) : 'select';
	const values = attrs.values ? splitCsv(attrs.values) : null;
	const applyTo = attrs.apply_to ? splitCsv(attrs.apply_to) : null;

	return {
		id: attrs.id,
		label: attrs.label || attrs.id,
		field: attrs.field,
		type,
		values,
		default: attrs.default ?? '',
		applyTo,
	};
}

function splitCsv(value: string): string[] {
	return value
		.split(',')
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
}

export function parseTableBlock(attrString: string): ParsedTableBlock | null {
	const attrs = parseChartAttributes(attrString);
	if (!attrs.query_id) {
		return null;
	}

	return {
		queryId: attrs.query_id,
		title: attrs.title || '',
	};
}

export const GRID_CLASSES: Record<number, string> = {
	1: 'grid-cols-1',
	2: 'grid-cols-1 @lg:grid-cols-2',
	3: 'grid-cols-1 @lg:grid-cols-2 @xl:grid-cols-3',
	4: 'grid-cols-1 @lg:grid-cols-2 @xl:grid-cols-3 @2xl:grid-cols-4',
};

export function getGridClass(cols: number): string {
	return GRID_CLASSES[Math.min(cols, 4)] ?? GRID_CLASSES[2];
}

function tryParseSeriesJson(value: string): ParsedChartBlock['series'] | null {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function extractSeriesFromRawAttrs(attrString: string): ParsedChartBlock['series'] | null {
	const seriesIdx = attrString.search(/\bseries\s*=/);
	if (seriesIdx === -1) {
		return null;
	}

	const bracketStart = attrString.indexOf('[', seriesIdx);
	if (bracketStart === -1) {
		return null;
	}

	let depth = 0;
	for (let i = bracketStart; i < attrString.length; i++) {
		if (attrString[i] === '[') {
			depth++;
		} else if (attrString[i] === ']') {
			depth--;
			if (depth === 0) {
				return tryParseSeriesJson(attrString.slice(bracketStart, i + 1));
			}
		}
	}
	return null;
}

export function splitCodeIntoSegments(code: string): Segment[] {
	const segments: Segment[] = [];
	const blockRegex =
		/<grid\s+([^>]*)>([\s\S]*?)<\/grid>|<chart\s+([^/>]*)\/?>|<table\s+([^/>]*)\/?>|<filter\s+([^/>]*)\/?>/g;
	let match;
	let lastIndex = 0;

	while ((match = blockRegex.exec(code)) !== null) {
		if (match.index > lastIndex) {
			const md = code.slice(lastIndex, match.index).trim();
			if (md) {
				segments.push({ type: 'markdown', content: md });
			}
		}

		if (match[1] !== undefined && match[2] !== undefined) {
			const gridAttrs = parseChartAttributes(match[1]);
			const cols = parseInt(gridAttrs.cols || '2', 10);
			const gridChildren = splitCodeIntoSegments(match[2]);
			segments.push({ type: 'grid', cols, children: gridChildren });
		} else if (match[3] !== undefined) {
			const chart = parseChartBlock(match[3]);
			if (chart) {
				segments.push({ type: 'chart', chart: { ...chart, rawTag: match[0] } });
			}
		} else if (match[4] !== undefined) {
			const table = parseTableBlock(match[4]);
			if (table) {
				segments.push({ type: 'table', table });
			}
		} else if (match[5] !== undefined) {
			const filter = parseFilterBlock(match[5]);
			if (filter) {
				segments.push({ type: 'filter', filter: { ...filter, rawTag: match[0] } });
			}
		}

		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < code.length) {
		const md = code.slice(lastIndex).trim();
		if (md) {
			segments.push({ type: 'markdown', content: md });
		}
	}

	return segments;
}

/**
 * Returns true when this filter has a meaningful selection. An empty value, an
 * empty list, or the special literal "all" is treated as "no filter applied".
 */
export function isActiveFilterValue(value: string | string[] | undefined): boolean {
	if (value === undefined) {
		return false;
	}
	if (typeof value === 'string') {
		const v = value.trim().toLowerCase();
		return v.length > 0 && v !== 'all';
	}
	const cleaned = value.map((v) => v.trim().toLowerCase()).filter((v) => v.length > 0 && v !== 'all');
	return cleaned.length > 0;
}

/**
 * Applies a single filter selection to a row. Returns true when the row passes
 * (or when the filter does not apply because the column is absent or empty).
 */
export function matchFilter(
	filter: ParsedFilterBlock,
	value: string | string[] | undefined,
	row: Record<string, unknown>,
): boolean {
	if (!isActiveFilterValue(value)) {
		return true;
	}
	const cell = row[filter.field];
	if (cell === undefined) {
		return true;
	}
	const cellString = cell === null ? '' : String(cell);

	switch (filter.type) {
		case 'select': {
			return cellString === String(value);
		}
		case 'multi-select': {
			const list = Array.isArray(value) ? value : String(value).split(',');
			const normalized = list.map((v) => v.trim()).filter((v) => v.length > 0 && v.toLowerCase() !== 'all');
			return normalized.length === 0 || normalized.includes(cellString);
		}
		case 'text': {
			const needle = String(value).trim().toLowerCase();
			return needle.length === 0 || cellString.toLowerCase().includes(needle);
		}
	}
}

/**
 * Walks a parsed segment tree and collects every `<filter>` block in document order.
 * Filters may appear at the top level or inside grids; both are surfaced.
 */
export function collectFilterSegments(segments: Segment[]): ParsedFilterBlock[] {
	const out: ParsedFilterBlock[] = [];
	for (const segment of segments) {
		if (segment.type === 'filter') {
			out.push(segment.filter);
		} else if (segment.type === 'grid') {
			out.push(...collectFilterSegments(segment.children));
		}
	}
	return out;
}
