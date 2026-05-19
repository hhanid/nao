import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
	DATE_FORMAT_PRESET_PATTERNS,
	DATE_FORMAT_TOKENS_DOC_URL,
	DEFAULT_DATE_FORMAT_SETTINGS,
	formatDateValue,
} from '@nao/shared/date';
import type { DateFormatPreset } from '@nao/shared/date';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsCard } from '@/components/ui/settings-card';
import { trpc } from '@/main';

interface DateFormatSectionProps {
	isAdmin: boolean;
}

interface PresetOption {
	value: DateFormatPreset;
	label: string;
	description: string;
}

const PRESET_OPTIONS: PresetOption[] = [
	{
		value: 'european',
		label: `European (${DATE_FORMAT_PRESET_PATTERNS.european})`,
		description: 'Day before month, slash-separated.',
	},
	{
		value: 'american',
		label: `American (${DATE_FORMAT_PRESET_PATTERNS.american})`,
		description: 'Month before day, slash-separated.',
	},
	{
		value: 'iso',
		label: `ISO 8601 (${DATE_FORMAT_PRESET_PATTERNS.iso})`,
		description: 'Sortable, year-first format.',
	},
	{
		value: 'custom',
		label: 'Custom',
		description: 'Provide your own pattern using date-fns tokens.',
	},
];

const SAMPLE_DATE = '2024-03-15';

export function DateFormatSection({ isAdmin }: DateFormatSectionProps) {
	const queryClient = useQueryClient();
	const displaySettings = useQuery(trpc.project.getDisplaySettings.queryOptions());

	const updateDisplaySettings = useMutation(
		trpc.project.updateDisplaySettings.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.project.getDisplaySettings.queryOptions().queryKey,
				});
			},
		}),
	);

	const preset: DateFormatPreset = displaySettings.data?.dateFormat?.preset ?? DEFAULT_DATE_FORMAT_SETTINGS.preset;
	const savedCustom = displaySettings.data?.dateFormat?.customFormat ?? '';

	const [customDraft, setCustomDraft] = useState(savedCustom);
	useEffect(() => setCustomDraft(savedCustom), [savedCustom]);

	const handlePresetChange = (next: string) => {
		const nextPreset = next as DateFormatPreset;
		updateDisplaySettings.mutate({
			dateFormat: {
				preset: nextPreset,
				customFormat: nextPreset === 'custom' ? customDraft.trim() || undefined : undefined,
			},
		});
	};

	const handleCustomSave = () => {
		const trimmed = customDraft.trim();
		if (trimmed === savedCustom) {
			return;
		}
		updateDisplaySettings.mutate({
			dateFormat: {
				preset: 'custom',
				customFormat: trimmed || undefined,
			},
		});
	};

	const effectiveSettings =
		preset === 'custom' ? { preset, customFormat: customDraft.trim() || undefined } : { preset };
	const preview = formatDateValue(SAMPLE_DATE, effectiveSettings);

	const isMutating = updateDisplaySettings.isPending;
	const isDisabled = !isAdmin || isMutating;

	return (
		<SettingsCard
			title='Date format'
			description='Choose how dates are displayed in charts, tooltips and query result tables for this project.'
		>
			<div className='grid gap-2'>
				<label htmlFor='date-format-preset' className='text-sm font-medium text-foreground'>
					Format
				</label>
				<Select value={preset} onValueChange={handlePresetChange} disabled={isDisabled}>
					<SelectTrigger id='date-format-preset' className='w-full'>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PRESET_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								<div className='flex flex-col gap-0.5'>
									<span>{option.label}</span>
									<span className='text-xs text-muted-foreground'>{option.description}</span>
								</div>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{preset === 'custom' && (
				<div className='grid gap-2'>
					<label htmlFor='date-format-custom' className='text-sm font-medium text-foreground'>
						Custom pattern
					</label>
					<Input
						id='date-format-custom'
						value={customDraft}
						placeholder='e.g. DD MMM YYYY'
						onChange={(event) => setCustomDraft(event.target.value)}
						onBlur={handleCustomSave}
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								handleCustomSave();
							}
						}}
						disabled={isDisabled}
						className='font-mono'
					/>
					<p className='text-xs text-muted-foreground'>
						Use{' '}
						<a
							href={DATE_FORMAT_TOKENS_DOC_URL}
							target='_blank'
							rel='noreferrer'
							className='underline underline-offset-2 hover:text-foreground'
						>
							date-fns format tokens
						</a>
						. Common tokens: <code className='font-mono'>YYYY</code>, <code className='font-mono'>MM</code>,{' '}
						<code className='font-mono'>DD</code>, <code className='font-mono'>MMM</code>,{' '}
						<code className='font-mono'>dddd</code>. Wrap literal text in square brackets, e.g.{' '}
						<code className='font-mono'>[on] DD/MM/YYYY</code>.
					</p>
				</div>
			)}

			<div className='flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2'>
				<span className='text-xs text-muted-foreground'>
					Preview for <code className='font-mono'>{SAMPLE_DATE}</code>
				</span>
				<span className='font-mono text-sm font-medium'>{preview}</span>
			</div>
		</SettingsCard>
	);
}
