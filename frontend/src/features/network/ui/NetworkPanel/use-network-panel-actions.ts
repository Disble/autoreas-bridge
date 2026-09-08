import { useCallback } from 'react';
import type { NetworkLevelFilter } from './network-panel.types';

/** The store setters the rail's filter/selection actions wrap. */
interface NetworkPanelActionsInput {
  readonly select: (id: string | null) => void;
  readonly setQuery: (query: string) => void;
  readonly setLevelFilter: (levelFilter: NetworkLevelFilter) => void;
  readonly setDomainFilter: (domainFilter: string) => void;
}

/**
 * Wraps the store's raw setters into the stable callbacks the filter bar and
 * table hand to their event handlers.
 *
 * Grouped into one hook because these five `useCallback`s are one concern —
 * the rail's outbound actions — not five independent ones (mirrors
 * `useNetworkStoreBindings`'s rationale for grouping the store subscriptions
 * themselves).
 * @param input The store setters to wrap.
 * @returns The selection and filter-change handlers the dumb UI renders with.
 */
export function useNetworkPanelActions(input: Readonly<NetworkPanelActionsInput>) {
  const { select, setQuery, setLevelFilter, setDomainFilter } = input;

  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onSelect = useCallback((id: string) => select(id), [select]);
  const onQueryChange = useCallback((nextQuery: string) => setQuery(nextQuery), [setQuery]);
  const onLevelFilterChange = useCallback(
    (nextLevelFilter: NetworkLevelFilter) => setLevelFilter(nextLevelFilter),
    [setLevelFilter],
  );
  const onDomainFilterChange = useCallback(
    (nextDomainFilter: string) => setDomainFilter(nextDomainFilter),
    [setDomainFilter],
  );
  const onClose = useCallback(() => select(null), [select]);

  // 7. Effects

  return { onSelect, onQueryChange, onLevelFilterChange, onDomainFilterChange, onClose };
}
