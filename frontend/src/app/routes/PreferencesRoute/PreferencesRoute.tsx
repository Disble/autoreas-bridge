import { Card, Tabs } from '@heroui/react';
import { PREFERENCES_ROUTE_TABS } from '../../../shared/preferences/preferences-route.constants';

/**
 * PreferencesRoute renders the Options workspace tabs and their colocated
 * settings panels.
 */
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
