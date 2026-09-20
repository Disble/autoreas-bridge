import { Tabs } from '@heroui/react';
import { ActivityOverview } from '../ActivityOverview/ActivityOverview';
import { NetworkPanel } from '../NetworkPanel/NetworkPanel';
import { TransactionPanel } from '../TransactionPanel/TransactionPanel';
import type { ActivityViewProps } from './activity-view.types';

/**
 * ActivityView integrates the aggregate overview, captured HTTP transactions
 * and internal runtime events into one Activity surface.
 *
 * The Overview is a TAB here rather than a route on purpose: it adds no entry
 * to the application's route table and none to the navigation rail, so the
 * Activity section stays one destination with three views of the same data.
 * Transactions remains the default tab, so the new surface moves nobody.
 *
 * `statusStrip` is opaque to this component: the app layer composes it (the
 * bridge status card) and this container only forwards it to the Overview
 * panel, which renders it above its aggregation content. Absence forwards as
 * absence — no strip, no fallback, no tab change.
 */
export function ActivityView({ initialTab = 'transactions', statusStrip }: Readonly<ActivityViewProps>) {
  return (
    <Tabs defaultSelectedKey={initialTab} variant="secondary">
      <Tabs.ListContainer>
        <Tabs.List aria-label="Activity modes">
          <Tabs.Tab id="overview">Overview</Tabs.Tab>
          <Tabs.Tab id="transactions">Transactions</Tabs.Tab>
          <Tabs.Tab id="runtime-events">Runtime Events</Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>

      <Tabs.Panel id="overview">
        <ActivityOverview statusStrip={statusStrip} />
      </Tabs.Panel>
      <Tabs.Panel id="transactions">
        <TransactionPanel />
      </Tabs.Panel>
      <Tabs.Panel id="runtime-events">
        <NetworkPanel />
      </Tabs.Panel>
    </Tabs>
  );
}
