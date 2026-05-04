import { createFileRoute } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';

import { useSession } from '@/lib/auth-client';
import { NewsletterSubscription } from '@/components/settings/newsletter-subscription';
import { Button } from '@/components/ui/button';
import { SettingsCard, SettingsPageWrapper } from '@/components/ui/settings-card';

const RELEASES_URL = 'https://github.com/getnao/nao/releases';

export const Route = createFileRoute('/_sidebar-layout/settings/updates')({
	component: UpdatesPage,
});

function UpdatesPage() {
	const { data: session } = useSession();

	return (
		<SettingsPageWrapper>
			<SettingsCard title='Release Notes' description='See what is new in nao.'>
				<div className='flex items-center justify-between'>
					<div className='flex flex-col gap-0.5'>
						<p className='text-sm font-medium text-foreground h-5'>GitHub Releases</p>
						<p className='text-xs text-muted-foreground'>
							Browse the full changelog of nao releases on GitHub.
						</p>
					</div>
					<Button variant='outline' size='sm' asChild>
						<a href={RELEASES_URL} target='_blank' rel='noopener noreferrer'>
							<ExternalLink />
							View releases
						</a>
					</Button>
				</div>
			</SettingsCard>

			<SettingsCard title='Newsletter' description='Stay in the loop with product news from nao.'>
				<NewsletterSubscription email={session?.user?.email} />
			</SettingsCard>
		</SettingsPageWrapper>
	);
}
