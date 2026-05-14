import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Github, GitBranch, Loader2, RefreshCw } from 'lucide-react';

import { GitHubRepoPicker } from '@/components/settings/github-repo-picker';
import { Button } from '@/components/ui/button';
import { ErrorMessage } from '@/components/ui/error-message';
import { SettingsCard } from '@/components/ui/settings-card';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/main';

function formatRelativeDate(isoDate: string): string {
	const date = new Date(isoDate);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60_000);

	if (diffMins < 1) {
		return 'just now';
	}
	if (diffMins < 60) {
		return `${diffMins}m ago`;
	}
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) {
		return `${diffHours}h ago`;
	}
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 30) {
		return `${diffDays}d ago`;
	}
	return date.toLocaleDateString();
}

export function GitSyncSection() {
	const queryClient = useQueryClient();
	const [repoPickerOpen, setRepoPickerOpen] = useState(false);

	const gitInfo = useQuery({
		...trpc.github.getProjectGitInfo.queryOptions(),
		staleTime: 30_000,
	});

	const githubAvailable = useQuery(trpc.github.isAvailable.queryOptions());
	const githubStatus = useQuery({
		...trpc.github.getStatus.queryOptions(),
		enabled: githubAvailable.data === true,
	});

	const pullMutation = useMutation({
		...trpc.github.pullProject.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: trpc.github.getProjectGitInfo.queryKey() });
		},
	});

	if (gitInfo.isLoading) {
		return (
			<SettingsCard title='Repository' icon={<Github className='size-4' />}>
				<Skeleton className='h-4 w-48' />
			</SettingsCard>
		);
	}

	if (!gitInfo.data?.isGithub) {
		if (githubAvailable.data !== true) {
			return null;
		}

		const isGithubConnected = githubStatus.data?.connected === true;

		return (
			<>
				<SettingsCard title='Import from GitHub' icon={<Github className='size-4' />}>
					<div className='flex items-center justify-between'>
						<p className='text-sm text-muted-foreground'>
							{isGithubConnected
								? 'Replace this project with a GitHub repository.'
								: 'Connect GitHub to import a repository into this project.'}
						</p>
						{isGithubConnected ? (
							<Button variant='secondary' size='sm' onClick={() => setRepoPickerOpen(true)}>
								<Github className='size-3.5' />
								Import from GitHub
							</Button>
						) : (
							<Button variant='secondary' size='sm' asChild>
								<a href='/api/github/connect'>
									<Github className='size-3.5' />
									Connect GitHub
								</a>
							</Button>
						)}
					</div>
				</SettingsCard>
				<GitHubRepoPicker open={repoPickerOpen} onOpenChange={setRepoPickerOpen} />
			</>
		);
	}

	const { repoFullName, branch, lastCommitMessage, lastCommitDate } = gitInfo.data;

	return (
		<SettingsCard
			title='Repository'
			icon={<Github className='size-4' />}
			action={
				<Button
					variant='secondary'
					size='sm'
					onClick={() => pullMutation.mutate()}
					disabled={pullMutation.isPending}
				>
					{pullMutation.isPending ? (
						<Loader2 className='size-3.5 animate-spin' />
					) : (
						<RefreshCw className='size-3.5' />
					)}
					Pull latest
				</Button>
			}
		>
			<div className='flex flex-col gap-2'>
				<div className='flex items-center gap-2 text-sm'>
					<a
						href={`https://github.com/${repoFullName}`}
						target='_blank'
						rel='noopener noreferrer'
						className='font-mono text-foreground hover:underline'
					>
						{repoFullName}
					</a>
					{branch && (
						<span className='flex items-center gap-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded'>
							<GitBranch className='size-3' />
							{branch}
						</span>
					)}
				</div>
				{lastCommitMessage && (
					<p className='text-xs text-muted-foreground truncate'>
						{lastCommitMessage}
						{lastCommitDate && (
							<span className='ml-1.5 opacity-70'>&middot; {formatRelativeDate(lastCommitDate)}</span>
						)}
					</p>
				)}
			</div>
			{pullMutation.error && <ErrorMessage message={pullMutation.error.message} />}
		</SettingsCard>
	);
}
