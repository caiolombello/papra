import type { Component } from 'solid-js';
import { formatBytes } from '@corentinth/chisels';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { Show, Suspense } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { fetchMeetingStats } from '@/modules/meetings/meetings.services';
import { fetchOrganizationUsage } from '@/modules/subscriptions/subscriptions.services';
import { Card, CardContent } from '@/modules/ui/components/card';
import { ProgressCircle } from '@/modules/ui/components/progress-circle';
import { Separator } from '@/modules/ui/components/separator';

const UsageCardLine: Component<{
  title: string;
  description: string;
  used: number;
  limit: number | null;
  formatValue?: (value: number) => string;
}> = (props) => {
  const { t } = useI18n();
  const percentage = () => {
    if (props.limit === null) {
      return 0;
    }
    return Math.min((props.used / props.limit) * 100, 100);
  };

  const formatValue = (value: number) => {
    return props.formatValue ? props.formatValue(value) : value.toString();
  };

  return (
    <div class="flex gap-4 items-center ">
      <ProgressCircle value={percentage()} size="xs" class="flex-shrink-0" />
      <div class="flex-1">
        <div class="font-medium leading-none">{props.title}</div>
        <div class="text-sm text-muted-foreground">{props.description}</div>
      </div>
      <div class="text-muted-foreground leading-none">{ `${formatValue(props.used)} / ${props.limit === null ? t('organization.usage.unlimited') : formatValue(props.limit)}${props.limit ? ` - ${percentage().toFixed(2)}%` : ''}`}</div>
    </div>
  );
};

export const OrganizationUsagePage: Component = () => {
  const params = useParams();
  const { t } = useI18n();

  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'usage'],
    queryFn: () => fetchOrganizationUsage({ organizationId: params.organizationId }),
  }));

  const meetingStatsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'meetings', 'stats'],
    queryFn: () => fetchMeetingStats({ organizationId: params.organizationId }),
  }));

  return (
    <div class="p-6 mt-10 pb-32 mx-auto max-w-screen-md w-full">
      <Suspense>
        <Show when={query.data}>
          {getData => (
            <>
              <h1 class="text-xl font-semibold mb-2">
                {t('organization.usage.page.title')}
              </h1>

              <p class="text-muted-foreground mb-6">
                {t('organization.usage.page.description')}
              </p>

              <Card>
                <CardContent class="pt-6 flex flex-col gap-4">
                  <UsageCardLine
                    title={t('organization.usage.storage.title')}
                    description={t('organization.usage.storage.description')}
                    used={getData().usage.documentsStorage.used}
                    limit={getData().usage.documentsStorage.limit}
                    formatValue={bytes => formatBytes({ bytes, base: 1000 })}
                  />

                  <Separator />

                  <UsageCardLine
                    title={t('organization.usage.intake-emails.title')}
                    description={t('organization.usage.intake-emails.description')}
                    used={getData().usage.intakeEmailsCount.used}
                    limit={getData().usage.intakeEmailsCount.limit}
                  />

                  <Separator />

                  <UsageCardLine
                    title={t('organization.usage.members.title')}
                    description={t('organization.usage.members.description')}
                    used={getData().usage.membersCount.used}
                    limit={getData().usage.membersCount.limit}
                  />

                </CardContent>
              </Card>

              <h2 class="text-lg font-semibold mt-8 mb-2">Estimated Monthly Costs</h2>
              <p class="text-muted-foreground mb-4">Based on current usage. Actual costs may vary.</p>

              <Card>
                <CardContent class="pt-6 flex flex-col gap-4">
                  {(() => {
                    const storageBytes = getData().usage.documentsStorage.used + (getData().usage.documentsStorage.deleted ?? 0);
                    const storageGb = storageBytes / (1024 * 1024 * 1024);
                    // S3 Standard sa-east-1: $0.0245/GB/month
                    const s3Cost = storageGb * 0.0245;
                    // DB + EC2 instance (c5.large on-demand sa-east-1): ~$62/month
                    const ec2Cost = 62;
                    // CloudFront: ~$0.085/GB transfer (first 10TB) + $0.0075/10K requests
                    const cfEstimate = 2; // rough estimate for low traffic
                    const meetingCost = meetingStatsQuery.data?.stats?.estimatedCostUsd ?? 0;
                    const totalEstimate = s3Cost + ec2Cost + cfEstimate + meetingCost;

                    return (
                      <>
                        <div class="flex items-center justify-between">
                          <div>
                            <div class="font-medium text-sm">S3 Storage</div>
                            <div class="text-xs text-muted-foreground">{formatBytes({ bytes: storageBytes, base: 1000 })} at $0.0245/GB/mo</div>
                          </div>
                          <div class="font-semibold">${s3Cost.toFixed(2)}</div>
                        </div>

                        <Separator />

                        <div class="flex items-center justify-between">
                          <div>
                            <div class="font-medium text-sm">EC2 (c5.large)</div>
                            <div class="text-xs text-muted-foreground">Papra server + transcription worker</div>
                          </div>
                          <div class="font-semibold">${ec2Cost.toFixed(2)}</div>
                        </div>

                        <Separator />

                        <div class="flex items-center justify-between">
                          <div>
                            <div class="font-medium text-sm">CloudFront</div>
                            <div class="text-xs text-muted-foreground">CDN, HTTPS, caching</div>
                          </div>
                          <div class="font-semibold">~${cfEstimate.toFixed(2)}</div>
                        </div>

                        <Separator />

                        <div class="flex items-center justify-between">
                          <div>
                            <div class="font-medium text-sm">Transcription (OpenAI)</div>
                            <div class="text-xs text-muted-foreground">{meetingStatsQuery.data?.stats?.totalDurationMinutes ?? 0} minutes transcribed</div>
                          </div>
                          <div class="font-semibold">${meetingCost.toFixed(2)}</div>
                        </div>

                        <Separator />

                        <div class="flex items-center justify-between pt-2">
                          <div class="font-semibold">Estimated Total</div>
                          <div class="text-xl font-bold">${totalEstimate.toFixed(2)}/mo</div>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              <Show when={meetingStatsQuery.data}>
                {getStats => (
                  <>
                    <h2 class="text-lg font-semibold mt-8 mb-2">Meetings</h2>
                    <p class="text-muted-foreground mb-4">Transcription usage statistics.</p>

                    <Card>
                      <CardContent class="pt-6 flex flex-col gap-4">
                        <div class="flex gap-4 items-center">
                          <div class="flex items-center justify-center size-10 rounded-full bg-primary/10 flex-shrink-0">
                            <div class="i-tabler-microphone size-5 text-primary" />
                          </div>
                          <div class="flex-1">
                            <div class="font-medium leading-none">Total meetings</div>
                            <div class="text-sm text-muted-foreground">All meetings in this organization</div>
                          </div>
                          <div class="text-2xl font-semibold">{getStats().stats.total}</div>
                        </div>

                        <Separator />

                        <div class="flex gap-6">
                          <div class="flex-1 text-center">
                            <div class="text-2xl font-semibold text-primary">{getStats().stats.completed}</div>
                            <div class="text-xs text-muted-foreground mt-1">Completed</div>
                          </div>
                          <div class="flex-1 text-center">
                            <div class="text-2xl font-semibold text-yellow-500">{getStats().stats.processing}</div>
                            <div class="text-xs text-muted-foreground mt-1">Processing</div>
                          </div>
                          <div class="flex-1 text-center">
                            <div class="text-2xl font-semibold text-red-500">{getStats().stats.failed}</div>
                            <div class="text-xs text-muted-foreground mt-1">Failed</div>
                          </div>
                        </div>

                        <Separator />

                        <div class="flex gap-6">
                          <div class="flex-1 text-center">
                            <div class="text-2xl font-semibold">{getStats().stats.totalDurationMinutes}</div>
                            <div class="text-xs text-muted-foreground mt-1">Minutes transcribed</div>
                          </div>
                          <div class="flex-1 text-center">
                            <div class="text-2xl font-semibold">${getStats().stats.estimatedCostUsd.toFixed(2)}</div>
                            <div class="text-xs text-muted-foreground mt-1">Estimated cost (USD)</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </Show>
            </>
          )}
        </Show>
      </Suspense>
    </div>
  );
};
