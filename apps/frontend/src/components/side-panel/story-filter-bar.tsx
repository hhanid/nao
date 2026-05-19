import { isActiveFilterValue } from '@nao/shared/story-segments';
import { ChevronDown, X } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import type { ParsedFilterBlock } from '@nao/shared/story-segments';

import type { QueryDataMap } from '@/components/story-embeds';
import type { FilterValue } from '@/contexts/story-filters';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStoryFilters } from '@/contexts/story-filters';

interface StoryFilterBarProps {
	queryData: QueryDataMap | null;
}

export const StoryFilterBar = memo(function StoryFilterBar({ queryData }: StoryFilterBarProps) {
	const ctx = useStoryFilters();
	if (!ctx || ctx.filters.length === 0) {
		return null;
	}

	return (
		<div className='sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background/80 px-6 py-2 backdrop-blur'>
			<span className='text-xs font-medium text-muted-foreground'>Filters</span>
			{ctx.filters.map((filter) => (
				<FilterControl key={filter.id} filter={filter} queryData={queryData} />
			))}
			{ctx.hasActiveFilters && (
				<Button
					variant='ghost'
					size='sm'
					onClick={ctx.resetAll}
					className='ml-auto h-7 px-2 text-xs text-muted-foreground'
				>
					<X className='size-3' /> Reset
				</Button>
			)}
		</div>
	);
});

interface FilterControlProps {
	filter: ParsedFilterBlock;
	queryData: QueryDataMap | null;
}

function FilterControl({ filter, queryData }: FilterControlProps) {
	const ctx = useStoryFilters();
	if (!ctx) {
		return null;
	}
	const value = ctx.values[filter.id];

	switch (filter.type) {
		case 'select':
			return <SelectFilterControl filter={filter} queryData={queryData} value={value ?? ''} />;
		case 'multi-select':
			return (
				<MultiSelectFilterControl
					filter={filter}
					queryData={queryData}
					value={Array.isArray(value) ? value : value ? [value] : []}
				/>
			);
		case 'text':
			return <TextFilterControl filter={filter} value={typeof value === 'string' ? value : ''} />;
	}
}

function SelectFilterControl({
	filter,
	queryData,
	value,
}: {
	filter: ParsedFilterBlock;
	queryData: QueryDataMap | null;
	value: FilterValue;
}) {
	const ctx = useStoryFilters()!;
	const options = useMemo(() => ctx.deriveOptionsFor(filter, queryData), [filter, queryData, ctx]);
	const selected = typeof value === 'string' ? value : '';

	return (
		<FilterShell label={filter.label}>
			<Select
				value={selected || 'all'}
				onValueChange={(next) => ctx.setValue(filter.id, next === 'all' ? '' : next)}
			>
				<SelectTrigger size='sm' variant='ghost' className='h-7 min-w-32'>
					<SelectValue placeholder='All' />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value='all'>All</SelectItem>
					{options.map((option) => (
						<SelectItem key={option} value={option}>
							{option}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</FilterShell>
	);
}

function MultiSelectFilterControl({
	filter,
	queryData,
	value,
}: {
	filter: ParsedFilterBlock;
	queryData: QueryDataMap | null;
	value: string[];
}) {
	const ctx = useStoryFilters()!;
	const options = useMemo(() => ctx.deriveOptionsFor(filter, queryData), [filter, queryData, ctx]);
	const [open, setOpen] = useState(false);

	const toggle = (option: string) => {
		const next = value.includes(option) ? value.filter((v) => v !== option) : [...value, option];
		ctx.setValue(filter.id, next);
	};

	const label = value.length === 0 ? 'All' : value.length === 1 ? value[0] : `${value.length} selected`;

	return (
		<FilterShell label={filter.label}>
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<Button variant='outline' size='sm' className='h-7 min-w-32 justify-between gap-1 font-normal'>
						<span className='truncate'>{label}</span>
						<ChevronDown className='size-3 opacity-50' />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align='start' className='max-h-72 overflow-y-auto'>
					{options.length === 0 ? (
						<div className='px-2 py-1 text-xs text-muted-foreground'>No options available</div>
					) : (
						options.map((option) => (
							<DropdownMenuCheckboxItem
								key={option}
								checked={value.includes(option)}
								onCheckedChange={() => toggle(option)}
								onSelect={(event) => event.preventDefault()}
							>
								{option}
							</DropdownMenuCheckboxItem>
						))
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</FilterShell>
	);
}

function TextFilterControl({ filter, value }: { filter: ParsedFilterBlock; value: string }) {
	const ctx = useStoryFilters()!;
	return (
		<FilterShell label={filter.label}>
			<Input
				value={value}
				onChange={(event) => ctx.setValue(filter.id, event.target.value)}
				placeholder='Contains…'
				className='h-7 w-40 text-sm'
			/>
		</FilterShell>
	);
}

function FilterShell({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className='flex items-center gap-1.5 text-xs text-muted-foreground'>
			<span className='font-medium'>{label}:</span>
			{children}
		</label>
	);
}

export function activeFilterCount(values: Record<string, FilterValue>): number {
	return Object.values(values).filter((v) => isActiveFilterValue(v)).length;
}
