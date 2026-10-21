import { Card, Tabs } from '@heroui/react';
import { PREFERENCES_ROUTE_TABS } from '../../../shared/preferences/preferences-route.constants';
import { PageHeader } from '../../../shared/ui/PageHeader/PageHeader';

/**
 * PreferencesRoute renders the Options workspace tabs and their colocated
 * settings panels.
 */
export function PreferencesRoute() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" />

      <Tabs defaultSelectedKey="library">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Options categories">
            {PREFERENCES_ROUTE_TABS.map((tab) => (
              <Tabs.Tab key={tab.id} id={tab.id}>
                {tab.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>

        {PREFERENCES_ROUTE_TABS.map(({ id, label, description, Panel }) => (
          <Tabs.Panel key={id} id={id}>
            <Card>
              <Card.Header>
                <Card.Title>{label}</Card.Title>
                <Card.Description>{description}</Card.Description>
              </Card.Header>
              <Card.Content>
                <Panel />
              </Card.Content>
            </Card>
          </Tabs.Panel>
        ))}
      </Tabs>
    </div>
  );
}
