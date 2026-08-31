import { Card, Chip, CloseButton, Tabs } from '@heroui/react';
import { NETWORK_DETAIL_EMPTY_MESSAGE, NETWORK_DETAIL_TAB_LABELS } from '../NetworkPanel/network-panel.constants';
import { getNetworkDomainColor, getNetworkLevelColor } from '../NetworkPanel/network-panel.helpers';
import type { NetworkDetailProps, NetworkDetailTab } from '../NetworkPanel/network-panel.types';
import { NetworkDetailGeneral } from './NetworkDetailGeneral';
import { NetworkDetailMetadata } from './NetworkDetailMetadata';
import { NetworkDetailTrace } from './NetworkDetailTrace';

/** Dumb tabbed detail inspector for the selected Network entry on HeroUI Tabs. Renders an empty prompt when nothing is selected. */
export function NetworkDetail({ detail, detailTab, onDetailTabChange, onClose }: Readonly<NetworkDetailProps>) {
  if (detail === null) {
    return (
      <Card>
        <Card.Content className="p-4 text-center text-default-400">
          <span className="text-sm">{NETWORK_DETAIL_EMPTY_MESSAGE}</span>
        </Card.Content>
      </Card>
    );
  }

  const { message, domain, level, timeLabel, fields, metadataEntries, traceEntries, hasCorrelation } = detail;

  return (
    // `min-w-0` on the card, not only on the grid track: a grid item whose
    // `min-width` is `auto` refuses to shrink below its content and overflows
    // even a `minmax(0, …)` track.
    //
    // This card is where the reported overflow was measured: with 40 trace
    // siblings carrying an unbroken JDownloader URL, its content came out at
    // 2950px inside a 471px card and the document at 3719px against a 1241px
    // viewport. See `scripts/layout-fixtures/activity-detail-fixture.tsx`.
    <Card className="min-w-0">
      <Card.Content className="flex min-w-0 flex-col gap-3 p-4">
        <header className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-words text-sm font-medium text-foreground">{message}</span>
            <CloseButton aria-label="Close detail inspector" className="shrink-0" onPress={onClose} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip color={getNetworkDomainColor(domain)} size="sm" variant="soft">
              {domain}
            </Chip>
            <Chip color={getNetworkLevelColor(level)} size="sm" variant="soft">
              {level}
            </Chip>
            <span className="font-mono text-xs text-default-500">{timeLabel}</span>
          </div>
        </header>

        <Tabs
          className="min-w-0"
          onSelectionChange={(key) => onDetailTabChange(String(key) as NetworkDetailTab)}
          selectedKey={detailTab}
          variant="secondary"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Detail inspector tabs">
              <Tabs.Tab id="general">{NETWORK_DETAIL_TAB_LABELS.general}</Tabs.Tab>
              <Tabs.Tab id="metadata">{NETWORK_DETAIL_TAB_LABELS.metadata}</Tabs.Tab>
              <Tabs.Tab id="trace">{NETWORK_DETAIL_TAB_LABELS.trace}</Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel className="min-w-0" id="general">
            <NetworkDetailGeneral fields={fields} />
          </Tabs.Panel>
          <Tabs.Panel className="min-w-0" id="metadata">
            <NetworkDetailMetadata metadataEntries={metadataEntries} />
          </Tabs.Panel>
          <Tabs.Panel className="min-w-0" id="trace">
            <NetworkDetailTrace hasCorrelation={hasCorrelation} traceEntries={traceEntries} />
          </Tabs.Panel>
        </Tabs>
      </Card.Content>
    </Card>
  );
}
