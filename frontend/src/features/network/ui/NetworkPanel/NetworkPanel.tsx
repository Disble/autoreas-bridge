import { NetworkDetail } from '../NetworkDetail/NetworkDetail';
import { NetworkFilterBar } from '../NetworkFilterBar/NetworkFilterBar';
import { NetworkTable } from '../NetworkTable/NetworkTable';
import { NETWORK_CAPTURE_UNAVAILABLE_MESSAGE, NETWORK_LOADING_STATE_MESSAGE } from './network-panel.constants';
import type { NetworkPanelProps } from './network-panel.types';
import { useNetworkPanel } from './use-network-panel';

/**
 * NetworkPanel is the DevTools-Network-style master/detail container: a
 * filter bar + request table on the left, the selected request's detail on
 * the right. All data flows from `useNetworkPanel`; this component only renders.
 */
export function NetworkPanel({ source }: Readonly<NetworkPanelProps>) {
  const {
    rows,
    selectedRow,
    query,
    statusFilter,
    isLoading,
    captureUnavailable,
    onSelect,
    onQueryChange,
    onStatusFilterChange,
  } = useNetworkPanel(source);

  return (
    <div className="flex flex-col gap-4">
      <NetworkFilterBar
        onQueryChange={onQueryChange}
        onStatusFilterChange={onStatusFilterChange}
        query={query}
        statusFilter={statusFilter}
      />

      {isLoading ? (
        <div className="rounded-xl border border-divider/60 bg-content1/30 py-10 text-center text-default-400">
          <span className="text-sm">{NETWORK_LOADING_STATE_MESSAGE}</span>
        </div>
      ) : (
        <>
          {captureUnavailable ? (
            <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              {NETWORK_CAPTURE_UNAVAILABLE_MESSAGE}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <NetworkTable onSelect={onSelect} rows={rows} selectedId={selectedRow?.correlationId ?? null} />
            <NetworkDetail row={selectedRow} />
          </div>
        </>
      )}
    </div>
  );
}
