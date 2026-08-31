import { Alert } from '@heroui/react';
import { ACTIVITY_MASTER_DETAIL_CLASS } from '../ActivityView/activity-view.constants';
import { NetworkDetail } from '../NetworkDetail/NetworkDetail';
import { NetworkFilterBar } from '../NetworkFilterBar/NetworkFilterBar';
import { NetworkTable } from '../NetworkTable/NetworkTable';
import { NETWORK_EVENTS_DEBUG_NOT_PERSISTED_NOTE } from './network-panel.constants';
import type { NetworkPanelProps } from './network-panel.types';
import { useNetworkPanel } from './use-network-panel';

/**
 * NetworkPanel is the DevTools-Network-style master/detail container over the
 * PERSISTED runtime-event store: a filter toolbar + dense per-event log table
 * on the left, the selected event's tabbed inspector on the right, and a
 * bottom status bar summarizing entry/error/shown counts. All data flows from
 * `useNetworkPanel`; this component only renders.
 *
 * The disclosure strip above the table is deliberate: an unreadable store and
 * a store with no `debug` rows are both absences the surface must name rather
 * than present as a measured "nothing happened".
 */
export function NetworkPanel({ source }: Readonly<NetworkPanelProps>) {
  const {
    rows,
    selectedId,
    selectedDetail,
    query,
    levelFilter,
    domainFilter,
    domainOptions,
    detailTab,
    statusMessage,
    emptyMessage,
    entryCount,
    errorCount,
    shownCount,
    onSelect,
    onQueryChange,
    onLevelFilterChange,
    onDomainFilterChange,
    onDetailTabChange,
    onClose,
    onScroll,
  } = useNetworkPanel(source);

  return (
    <div className="flex flex-col gap-4">
      <NetworkFilterBar
        domainFilter={domainFilter}
        domainOptions={domainOptions}
        levelFilter={levelFilter}
        onDomainFilterChange={onDomainFilterChange}
        onLevelFilterChange={onLevelFilterChange}
        onQueryChange={onQueryChange}
        query={query}
      />

      <p className="text-[11px] text-default-400">{NETWORK_EVENTS_DEBUG_NOT_PERSISTED_NOTE}</p>

      {statusMessage === null ? null : (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{statusMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className={ACTIVITY_MASTER_DETAIL_CLASS}>
        <NetworkTable
          emptyMessage={emptyMessage}
          onScroll={onScroll}
          onSelect={onSelect}
          rows={rows}
          selectedId={selectedId}
        />
        <NetworkDetail detail={selectedDetail} detailTab={detailTab} onClose={onClose} onDetailTabChange={onDetailTabChange} />
      </div>

      <footer className="flex items-center gap-1.5 rounded-lg border border-divider/40 bg-content1/20 px-3 py-1.5 text-[11px] text-default-400">
        <span>{entryCount} entries</span>
        <span aria-hidden="true">·</span>
        <span>{errorCount} errors</span>
        <span aria-hidden="true">·</span>
        <span>{shownCount} shown</span>
      </footer>
    </div>
  );
}
