import type { BudgetPeriod } from './types';

export function getCurrentPeriodStart(period: BudgetPeriod): Date {
	const now = new Date();
	switch (period) {
		case 'day':
			return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
		case 'week': {
			const dayOfWeek = now.getUTCDay();
			const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
			return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset));
		}
		case 'month':
			return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	}
}

export function getNextPeriodStart(period: BudgetPeriod): Date {
	const start = getCurrentPeriodStart(period);
	switch (period) {
		case 'day':
			return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1));
		case 'week':
			return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7));
		case 'month':
			return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
	}
}

export const DATE_FORMAT_PRESETS = ['european', 'american', 'iso', 'custom'] as const;
export type DateFormatPreset = (typeof DATE_FORMAT_PRESETS)[number];

export interface DateFormatSettings {
	preset: DateFormatPreset;
	customFormat?: string;
}

export const DEFAULT_DATE_FORMAT_SETTINGS: DateFormatSettings = {
	preset: 'european',
};

export const DATE_FORMAT_PRESET_PATTERNS: Record<Exclude<DateFormatPreset, 'custom'>, string> = {
	european: 'DD/MM/YYYY',
	american: 'MM/DD/YYYY',
	iso: 'YYYY-MM-DD',
};

/**
 * URL to the documentation describing the supported date-fns format tokens.
 * Used by the project settings UI to link users to the codification reference.
 */
export const DATE_FORMAT_TOKENS_DOC_URL = 'https://date-fns.org/docs/format';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;

/**
 * Returns true when the input looks like an ISO date (YYYY-MM-DD…) and can be
 * parsed into a real Date.
 */
export function isIsoDateLike(value: unknown): boolean {
	return typeof value === 'string' && isIsoDateString(value);
}

function isIsoDateString(value: string): boolean {
	if (!ISO_DATE_REGEX.test(value)) {
		return false;
	}
	return !isNaN(new Date(value).getTime());
}

/**
 * Resolves the effective date-fns-style pattern for the given settings,
 * falling back to the European preset when the custom pattern is missing.
 */
export function resolveDateFormatPattern(settings?: DateFormatSettings | null): string {
	const preset = settings?.preset ?? DEFAULT_DATE_FORMAT_SETTINGS.preset;
	if (preset === 'custom') {
		const trimmed = settings?.customFormat?.trim();
		if (trimmed) {
			return trimmed;
		}
		return DATE_FORMAT_PRESET_PATTERNS.european;
	}
	return DATE_FORMAT_PRESET_PATTERNS[preset];
}

/**
 * Formats an ISO date-like value using a date-fns-style token pattern, in UTC.
 *
 * Supported tokens (a practical subset that maps to the common presets):
 *   - YYYY / YY  – 4 or 2 digit year
 *   - MMMM / MMM / MM / M  – month name (long/short) / 0-padded / numeric
 *   - DD / D  – day of month (0-padded / numeric)
 *   - dddd / ddd – weekday (long/short)
 *
 * Quoted segments (e.g. `[Q]Q`) are emitted verbatim.
 *
 * Non-date inputs are returned as-is via `String(value)`.
 */
export function formatDateValue(value: unknown, settings?: DateFormatSettings | null): string {
	if (typeof value !== 'string' || !isIsoDateString(value)) {
		return String(value ?? '');
	}
	const date = new Date(value);
	const pattern = resolveDateFormatPattern(settings);
	return formatDateWithPattern(date, pattern);
}

const MONTH_NAMES_LONG = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];
const MONTH_NAMES_SHORT = MONTH_NAMES_LONG.map((m) => m.slice(0, 3));
const WEEKDAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_NAMES_SHORT = WEEKDAY_NAMES_LONG.map((w) => w.slice(0, 3));

const TOKEN_REGEX = /YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|\[([^\]]*)\]/g;

function formatDateWithPattern(date: Date, pattern: string): string {
	const year = date.getUTCFullYear();
	const monthIndex = date.getUTCMonth();
	const day = date.getUTCDate();
	const weekdayIndex = date.getUTCDay();

	return pattern.replace(TOKEN_REGEX, (token, literal: string | undefined) => {
		if (literal !== undefined) {
			return literal;
		}
		switch (token) {
			case 'YYYY':
				return String(year).padStart(4, '0');
			case 'YY':
				return String(year % 100).padStart(2, '0');
			case 'MMMM':
				return MONTH_NAMES_LONG[monthIndex];
			case 'MMM':
				return MONTH_NAMES_SHORT[monthIndex];
			case 'MM':
				return String(monthIndex + 1).padStart(2, '0');
			case 'M':
				return String(monthIndex + 1);
			case 'DD':
				return String(day).padStart(2, '0');
			case 'D':
				return String(day);
			case 'dddd':
				return WEEKDAY_NAMES_LONG[weekdayIndex];
			case 'ddd':
				return WEEKDAY_NAMES_SHORT[weekdayIndex];
			default:
				return token;
		}
	});
}
