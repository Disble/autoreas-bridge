import type { ReactNode } from 'react';
import { Card, Tabs } from '@heroui/react';
import { ConnectedDevicesPanel } from '../../features/preferences/ui/ConnectedDevicesPanel/ConnectedDevicesPanel';
import { DownloadsRootPanel } from '../../features/preferences/ui/DownloadsRootPanel';

/** One Options category: a tab plus the panel it reveals. */
interface PreferencesTab {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly panel: ReactNode;
}

/**
 * PREFERENCES_TABS is the Options category registry. Add a category by appending
 * one entry here — the tab strip and its panel are rendered from this list, so
 * existing panels are never touched when a new category lands.
 */
const PREFERENCES_TABS: readonly PreferencesTab[] = [
  {
    id: 'devices',
    label: 'Connected Devices',
    description: 'Review paired devices, sync status, and revoke access.',
    panel: <ConnectedDevicesPanel />,
  },
  {
    id: 'downloads',
    label: 'Downloads',
    description: 'Configure where new season animes are downloaded.',
    panel: <DownloadsRootPanel />,
  },
];

export function PreferencesRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Opciones</h1>
        <p className="text-sm text-muted">Configura el comportamiento de la aplicación</p>
      </header>

      <Tabs defaultSelectedKey="devices">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Options categories">
            {PREFERENCES_TABS.map((tab) => (
              <Tabs.Tab key={tab.id} id={tab.id}>
                {tab.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>

        {PREFERENCES_TABS.map((tab) => (
          <Tabs.Panel key={tab.id} id={tab.id}>
            <Card>
              <Card.Header>
                <Card.Title>{tab.label}</Card.Title>
                <Card.Description>{tab.description}</Card.Description>
              </Card.Header>
              <Card.Content>{tab.panel}</Card.Content>
            </Card>
          </Tabs.Panel>
        ))}
      </Tabs>
    </div>
  );
}
