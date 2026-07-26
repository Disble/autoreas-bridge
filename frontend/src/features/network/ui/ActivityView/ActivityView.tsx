import { Tabs } from '@heroui/react';
import { NetworkPanel } from '../NetworkPanel/NetworkPanel';
import { TransactionPanel } from '../TransactionPanel/TransactionPanel';

/** ActivityView integrates captured HTTP transactions and internal runtime events into one Activity surface. */
export function ActivityView({ initialTab = 'transactions' }: Readonly<{ initialTab?: 'transactions' | 'runtime-events' }>) {
  return (
    <Tabs defaultSelectedKey={initialTab} variant="secondary">
      <Tabs.ListContainer>
        <Tabs.List aria-label="Activity modes">
          <Tabs.Tab id="transactions">Transactions</Tabs.Tab>
          <Tabs.Tab id="runtime-events">Runtime Events</Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>

      <Tabs.Panel id="transactions">
        <TransactionPanel />
      </Tabs.Panel>
      <Tabs.Panel id="runtime-events">
        <NetworkPanel />
      </Tabs.Panel>
    </Tabs>
  );
}
