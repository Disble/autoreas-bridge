import { Alert } from '@heroui/react';
import { useObservabilityFacts } from '../../../../shared/hooks/use-observability-facts/use-observability-facts';
import { ACTIVITY_MASTER_DETAIL_CLASS } from '../ActivityView/activity-view.constants';
import { NetworkDetail } from '../NetworkDetail/NetworkDetail';
import { NetworkFilterBar } from '../NetworkFilterBar/NetworkFilterBar';
import { NetworkTable } from '../NetworkTable/NetworkTable';
import {
  EVENT_PAGE_SIZE,
  NETWORK_EVENTS_DEBUG_NOT_PERSISTED_NOTE,
  NETWORK_EVENTS_RETENTION_UNAVAILABLE_NOTE,
  NETWORK_UPDATING_STATE_MESSAGE,
} from './network-panel.constants';
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
    isLoading,
    isUpdating,
    statusMessage,
    emptyMessage,
    entryCount,
    errorCount,
    shownCount,
    topSpacerHeightPx,
    bottomSpacerHeightPx,
    scrollRef,
    onSelect,
    onQueryChange,
    onLevelFilterChange,
    onDomainFilterChange,
    onDetailTabChange,
    onClose,
  } = useNetworkPanel(source);
  const facts = useObservabilityFacts();

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

      <p className="text-[11px] text-default-400">
        {`Showing ${EVENT_PAGE_SIZE} events per page; `}
        {facts === null
          ? NETWORK_EVENTS_RETENTION_UNAVAILABLE_NOTE
          : `the event store retains the most recent ${facts.retention.eventRows} rows.`}
        {/* Discreet updating hint inside the existing status line: no grid
            item and no extra line, so the layout gate's height budget holds. */}
        {isUpdating ? <span className="text-default-400">{` · ${NETWORK_UPDATING_STATE_MESSAGE}`}</span> : null}
      </p>

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
          bottomSpacerHeightPx={bottomSpacerHeightPx}
          emptyMessage={emptyMessage}
          isLoading={isLoading}
          isUpdating={isUpdating}
          onSelect={onSelect}
          rows={rows}
          scrollRef={scrollRef}
          selectedId={selectedId}
          topSpacerHeightPx={topSpacerHeightPx}
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
