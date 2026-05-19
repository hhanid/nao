import { describe, expect, it } from 'vitest';

import {
	collectFilterSegments,
	isActiveFilterValue,
	matchFilter,
	parseFilterBlock,
	splitCodeIntoSegments,
} from '../src/story-segments';

describe('filter segment parsing', () => {
	it('parses a select filter with default and values list', () => {
		const tag =
			'<filter id="country" label="Country" field="country" type="select" default="US" values="US, FR, DE" />';
		const segments = splitCodeIntoSegments(tag);
		expect(segments).toHaveLength(1);
		expect(segments[0].type).toBe('filter');
		if (segments[0].type !== 'filter') {
			return;
		}
		expect(segments[0].filter).toMatchObject({
			id: 'country',
			label: 'Country',
			field: 'country',
			type: 'select',
			default: 'US',
			values: ['US', 'FR', 'DE'],
			applyTo: null,
		});
	});

	it('defaults type to "select" when an unknown value is supplied', () => {
		const filter = parseFilterBlock('id="x" field="x" type="weird"');
		expect(filter?.type).toBe('select');
	});

	it('returns null when required attrs are missing', () => {
		expect(parseFilterBlock('label="Country" field="country"')).toBeNull();
		expect(parseFilterBlock('id="x"')).toBeNull();
	});

	it('collects filters across grids in document order', () => {
		const code = [
			'<filter id="a" field="a" />',
			'<grid cols="2">',
			'<filter id="b" field="b" type="text" />',
			'</grid>',
		].join('\n');
		const filters = collectFilterSegments(splitCodeIntoSegments(code));
		expect(filters.map((f) => f.id)).toEqual(['a', 'b']);
	});
});

describe('matchFilter', () => {
	const filter = {
		id: 'country',
		label: 'Country',
		field: 'country',
		type: 'select' as const,
		values: null,
		default: '',
		applyTo: null,
	};

	it('treats empty / "all" as no filter', () => {
		expect(isActiveFilterValue('')).toBe(false);
		expect(isActiveFilterValue('all')).toBe(false);
		expect(isActiveFilterValue('US')).toBe(true);
		expect(isActiveFilterValue([])).toBe(false);
		expect(isActiveFilterValue(['all'])).toBe(false);
		expect(isActiveFilterValue(['US'])).toBe(true);
	});

	it('passes rows when the column is absent from the row', () => {
		expect(matchFilter(filter, 'US', { other: 'x' })).toBe(true);
	});

	it('matches a select filter by exact equality', () => {
		expect(matchFilter(filter, 'US', { country: 'US' })).toBe(true);
		expect(matchFilter(filter, 'US', { country: 'FR' })).toBe(false);
	});

	it('matches a multi-select filter against any of its values', () => {
		const multi = { ...filter, type: 'multi-select' as const };
		expect(matchFilter(multi, ['US', 'FR'], { country: 'FR' })).toBe(true);
		expect(matchFilter(multi, ['US', 'FR'], { country: 'DE' })).toBe(false);
	});

	it('matches a text filter case-insensitively as a substring', () => {
		const text = { ...filter, type: 'text' as const };
		expect(matchFilter(text, 'uni', { country: 'United States' })).toBe(true);
		expect(matchFilter(text, 'xyz', { country: 'United States' })).toBe(false);
	});
});
