import { Chip } from '@heroui/react';
import { NETWORK_DETAIL_EMPTY_MESSAGE, NETWORK_DETAIL_TAB_LABELS } from '../NetworkPanel/network-panel.constants';
import { getNetworkDetailTabButtonClass, getNetworkDomainColor, getNetworkLevelColor } from '../NetworkPanel/network-panel.helpers';
import type { NetworkDetailProps, NetworkDetailTab } from '../NetworkPanel/network-panel.types';
import { NetworkDetailGeneral } from './NetworkDetailGeneral';
import { NetworkDetailMetadata } from './NetworkDetailMetadata';
import { NetworkDetailTrace } from './NetworkDetailTrace';

/** Dumb tabbed detail inspector for the selected Network entry. Renders an empty prompt when nothing is selected. */
export function NetworkDetail({ detail, detailTab, onDetailTabChange, onClose }: Readonly<NetworkDetailProps>) {
  if (detail === null) {
    return (
      <div className="rounded-xl border border-divider/60 bg-content1/30 p-4 text-center text-default-400">
        <span className="text-sm">{NETWORK_DETAIL_EMPTY_MESSAGE}</span>
      </div>
    );
  }

  const { message, domain, level, timeLabel, fields, metadataEntries, traceEntries } = detail;
  const hasTrace = traceEntries.length > 0;
  const visibleTabs: readonly NetworkDetailTab[] = hasTrace ? ['general', 'metadata', 'trace'] : ['general', 'metadata'];
  const activeTab = !hasTrace && detailTab === 'trace' ? 'general' : detailTab;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-divider/60 bg-content1/30 p-4">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{message}</span>
          <button
            aria-label="Close detail inspector"
            className="shrink-0 rounded p-1 text-default-400 hover:bg-white/[0.06] hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip color={getNetworkDomainColor(domain)} size="sm" variant="soft">
            <Chip.Label id="network-detail-domain">{domain}</Chip.Label>
          </Chip>
          <Chip color={getNetworkLevelColor(level)} size="sm" variant="soft">
            <Chip.Label id="network-detail-level">{level}</Chip.Label>
          </Chip>
          <span className="font-mono text-xs text-default-500">{timeLabel}</span>
        </div>
      </header>

      <div aria-label="Detail inspector tabs" className="flex items-center gap-1 border-b border-divider/40 pb-1" role="tablist">
        {visibleTabs.map((tab) => (
          <button
            aria-selected={activeTab === tab}
            className={getNetworkDetailTabButtonClass(activeTab === tab)}
            key={tab}
            onClick={() => onDetailTabChange(tab)}
            role="tab"
            type="button"
          >
            {NETWORK_DETAIL_TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'general' ? <NetworkDetailGeneral fields={fields} /> : null}
      {activeTab === 'metadata' ? <NetworkDetailMetadata metadataEntries={metadataEntries} /> : null}
      {activeTab === 'trace' && hasTrace ? <NetworkDetailTrace traceEntries={traceEntries} /> : null}
    </div>
  );
}
