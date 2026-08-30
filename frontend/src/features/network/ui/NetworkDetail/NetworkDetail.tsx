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
    <Card>
      <Card.Content className="flex flex-col gap-3 p-4">
        <header className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{message}</span>
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

          <Tabs.Panel id="general">
            <NetworkDetailGeneral fields={fields} />
          </Tabs.Panel>
          <Tabs.Panel id="metadata">
            <NetworkDetailMetadata metadataEntries={metadataEntries} />
          </Tabs.Panel>
          <Tabs.Panel id="trace">
            <NetworkDetailTrace hasCorrelation={hasCorrelation} traceEntries={traceEntries} />
          </Tabs.Panel>
        </Tabs>
      </Card.Content>
    </Card>
  );
}
