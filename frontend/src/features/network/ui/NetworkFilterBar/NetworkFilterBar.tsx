import {
  NETWORK_DOMAIN_FILTER_OPTIONS,
  NETWORK_FILTER_PLACEHOLDER,
  NETWORK_LEVEL_FILTER_OPTIONS,
} from '../NetworkPanel/network-panel.constants';
import { getNetworkFilterPillClass } from '../NetworkPanel/network-panel.helpers';
import type { NetworkFilterBarProps } from '../NetworkPanel/network-panel.types';

/** Dumb compact toolbar: free-text query input plus DOMAIN and LEVEL filter pill rows. */
export function NetworkFilterBar({
  query,
  levelFilter,
  domainFilter,
  onQueryChange,
  onLevelFilterChange,
  onDomainFilterChange,
}: Readonly<NetworkFilterBarProps>) {
  return (
    <div className="flex flex-col gap-2">
      <input
        aria-label="Filter network entries"
        className="min-w-0 rounded-lg border border-divider/60 bg-content1/40 px-3 py-1.5 text-sm text-foreground placeholder:text-default-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={NETWORK_FILTER_PLACEHOLDER}
        type="search"
        value={query}
      />

      <div aria-label="Filter by domain" className="flex flex-wrap items-center gap-1" role="toolbar">
        {NETWORK_DOMAIN_FILTER_OPTIONS.map((option) => (
          <button
            aria-pressed={domainFilter === option.value}
            className={getNetworkFilterPillClass(domainFilter === option.value)}
            key={option.value}
            onClick={() => onDomainFilterChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div aria-label="Filter by level" className="flex flex-wrap items-center gap-1" role="toolbar">
        {NETWORK_LEVEL_FILTER_OPTIONS.map((option) => (
          <button
            aria-pressed={levelFilter === option.value}
            className={getNetworkFilterPillClass(levelFilter === option.value)}
            key={option.value}
            onClick={() => onLevelFilterChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
