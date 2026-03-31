import type { ParentComponent } from 'solid-js';
import { A, useLocation, useParams } from '@solidjs/router';
import { For } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { SideNav } from '@/modules/ui/components/sidenav';
import { Button } from '../components/button';

export const OrganizationSettingsLayout: ParentComponent = (props) => {
  const params = useParams();
  const location = useLocation();
  const { t } = useI18n();

  const getNavigationItems = () => [
    {
      label: t('layout.menu.general-settings'),
      href: `/organizations/${params.organizationId}/settings`,
      icon: 'i-tabler-settings',
    },
    {
      label: t('layout.menu.usage'),
      href: `/organizations/${params.organizationId}/settings/usage`,
      icon: 'i-tabler-chart-bar',
    },
    {
      label: t('layout.menu.intake-emails'),
      href: `/organizations/${params.organizationId}/settings/intake-emails`,
      icon: 'i-tabler-mail',
    },
    {
      label: t('layout.menu.webhooks'),
      href: `/organizations/${params.organizationId}/settings/webhooks`,
      icon: 'i-tabler-webhook',
    },
    {
      label: t('layout.menu.pdf-password-rules'),
      href: `/organizations/${params.organizationId}/settings/pdf-password-rules`,
      icon: 'i-tabler-lock',
    },
    {
      label: 'Shared Links',
      href: `/organizations/${params.organizationId}/settings/shared-links`,
      icon: 'i-tabler-share',
    },
    {
      label: 'Audit Log',
      href: `/organizations/${params.organizationId}/settings/audit-log`,
      icon: 'i-tabler-shield-check',
    },
  ];

  const isActive = (href: string) => {
    const basePath = `/organizations/${params.organizationId}/settings`;
    if (href === basePath) {
      return location.pathname === basePath;
    }
    return location.pathname.startsWith(href);
  };

  return (
    <div class="flex flex-col md:flex-row h-screen min-h-0">
      {/* Mobile: horizontal scrollable tabs */}
      <div class="md:hidden border-b border-b-border bg-card">
        <div class="flex items-center gap-1 px-3 py-2 border-b border-b-border">
          <Button variant="ghost" size="icon" class="text-muted-foreground size-8" as={A} href={`/organizations/${params.organizationId}`}>
            <div class="i-tabler-arrow-left size-4" />
          </Button>
          <h1 class="text-sm font-bold">{t('organization.settings.title')}</h1>
        </div>
        <div class="flex overflow-x-auto gap-1 px-3 py-2 scrollbar-none">
          <For each={getNavigationItems()}>
            {item => (
              <A
                href={item.href}
                class={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                  isActive(item.href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <div class={cn(item.icon, 'size-3.5')} />
                {item.label}
              </A>
            )}
          </For>
        </div>
      </div>

      {/* Desktop: sidebar */}
      <div class="w-280px border-r border-r-border flex-shrink-0 hidden md:block bg-card">
        <SideNav
          mainMenu={getNavigationItems()}
          header={() => (
            <div class="pl-6 py-3 border-b border-b-border flex items-center gap-1">
              <Button variant="ghost" size="icon" class="text-muted-foreground" as={A} href={`/organizations/${params.organizationId}`}>
                <div class="i-tabler-arrow-left size-5" />
              </Button>
              <h1 class="text-base font-bold">
                {t('organization.settings.title')}
              </h1>
            </div>
          )}
        />
      </div>

      <div class="flex-1 min-h-0 flex flex-col overflow-auto">
        {props.children}
      </div>
    </div>
  );
};
