import { NETWORK_STATUS_FILTER_OPTIONS } from '../NetworkPanel/network-panel.constants';
import type { NetworkFilterBarProps, NetworkStatusFilter } from '../NetworkPanel/network-panel.types';

/** Dumb filter bar: a free-text query input and a status-filter dropdown. */
export function NetworkFilterBar({ query, statusFilter, onQueryChange, onStatusFilterChange }: Readonly<NetworkFilterBarProps>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        aria-label="Filter requests"
        className="min-w-0 flex-1 rounded-lg border border-divider/60 bg-content1/40 px-3 py-1.5 text-sm text-foreground placeholder:text-default-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Filter by method or path…"
        type="search"
        value={query}
      />
      <select
        aria-label="Filter by status"
        className="rounded-lg border border-divider/60 bg-content1/40 px-3 py-1.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        onChange={(event) => onStatusFilterChange(event.target.value as NetworkStatusFilter)}
        value={statusFilter}
      >
        {NETWORK_STATUS_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
