import { NetworkDetail } from '../NetworkDetail/NetworkDetail';
import { NetworkFilterBar } from '../NetworkFilterBar/NetworkFilterBar';
import { NetworkTable } from '../NetworkTable/NetworkTable';
import { NETWORK_CAPTURE_UNAVAILABLE_MESSAGE } from './network-panel.constants';
import type { NetworkPanelProps } from './network-panel.types';
import { useNetworkPanel } from './use-network-panel';

/**
 * NetworkPanel is the DevTools-Network-style master/detail container: a
 * filter toolbar + dense per-entry log table on the left, the selected
 * entry's tabbed inspector on the right, and a bottom status bar
 * summarizing entry/error/shown counts. All data flows from
 * `useNetworkPanel`; this component only renders.
 */
export function NetworkPanel({ source }: Readonly<NetworkPanelProps>) {
  const {
    rows,
    selectedId,
    selectedDetail,
    query,
    levelFilter,
    domainFilter,
    detailTab,
    isLoading,
    captureUnavailable,
    entryCount,
    errorCount,
    shownCount,
    onSelect,
    onQueryChange,
    onLevelFilterChange,
    onDomainFilterChange,
    onDetailTabChange,
    onClose,
    scrollRef,
    onTableScroll,
  } = useNetworkPanel(source);

  return (
    <div className="flex flex-col gap-4">
      <NetworkFilterBar
        domainFilter={domainFilter}
        levelFilter={levelFilter}
        onDomainFilterChange={onDomainFilterChange}
        onLevelFilterChange={onLevelFilterChange}
        onQueryChange={onQueryChange}
        query={query}
      />

      {captureUnavailable ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {NETWORK_CAPTURE_UNAVAILABLE_MESSAGE}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <NetworkTable isLoading={isLoading} onScroll={onTableScroll} onSelect={onSelect} rows={rows} scrollRef={scrollRef} selectedId={selectedId} />
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
