import { useCallback, useEffect } from 'react';
import type { RuntimeEventSource } from '../../../../infrastructure/runtime-event-source/runtime-event-source.types';
import { toOverlayEventRow, toRuntimeEventRow } from '../../../../shared/store/network-store/network-store.feed.helpers';
import { getNetworkStoreState } from '../../../../shared/store/network-store/network-store.helpers';
import {
  admitOverlayEntry,
  selectHeadRows,
  toDomainFilterOptions,
  toEventQueryFilters,
} from './network-feed.helpers';
import type { EventFeedFilters, RuntimeEventRow } from './network-panel.types';
import type { useNetworkStoreBindings } from './use-network-store-bindings';

/** Stable empty sibling list, so clearing the Trace view never churns identity. */
const NO_TRACE_SIBLINGS: readonly RuntimeEventRow[] = [];

/** Everything the panel's asynchronous edges need from their caller. */
interface NetworkPanelSyncInput {
  readonly source: RuntimeEventSource;
  readonly limit: number;
  readonly filters: EventFeedFilters;
  /** Correlation id of the selected event, or null when it carries none. */
  readonly selectedCorrelationId: string | null;
  readonly store: ReturnType<typeof useNetworkStoreBindings>;
  readonly setLoading: (isLoading: boolean) => void;
  readonly setDegraded: (degraded: boolean) => void;
  readonly setTraceSiblings: (siblings: readonly RuntimeEventRow[]) => void;
}

/**
 * Owns every asynchronous edge of the Runtime Events rail: the first page and
 * filter-driven reloads, the cursor-paged load-more, the unfiltered
 * domain-facet fetch, the persisted sibling lookup behind the Trace view, and
 * the live push subscription that overlays the persisted page.
 *
 * Mirrors `useTransactionPanelSync`, including its `active` cancellation
 * bookkeeping: a filter changed mid-flight must not let the previous query's
 * page land on top of the new one.
 *
 * The domain-facet fetch is deliberately UNFILTERED. Passing the active domain
 * would collapse the option list to the selected value and make every other
 * domain unreachable after one click — the S-3 defect, reintroduced one layer
 * down (design D-5).
 * @param input The source, page size, active filters, selection and setters.
 * @returns The load-more action the visible window triggers at the feed's end.
 */
export function useNetworkPanelSync(input: Readonly<NetworkPanelSyncInput>) {
  const { source, limit, filters, selectedCorrelationId, store, setLoading, setDegraded, setTraceSiblings } = input;
  const { nextCursor, isLoadingMore, setPage, setAvailable, setLoadingMore, setDomainOptions } = store;

  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const loadMore = useCallback(() => {
    if (nextCursor === null || isLoadingMore) {
      return;
    }

    setLoadingMore(true);

    void source
      .searchEvents({ limit, cursor: nextCursor, filters: toEventQueryFilters(filters) })
      .then((page) => {
        setPage(page.items.map(toRuntimeEventRow), page.nextCursor ?? null, 'append');
        setLoadingMore(false);
      });
    // The filter fields are read through `filters`, whose identity the caller
    // memoizes on those same three values.
  }, [filters, isLoadingMore, limit, nextCursor, setLoadingMore, setPage, source]);

  // 7. Effects
  useEffect(() => {
    let active = true;
    setLoading(true);

    void source.searchEvents({ limit, filters: toEventQueryFilters(filters) }).then((page) => {
      if (!active) {
        return;
      }

      setPage(page.items.map(toRuntimeEventRow), page.nextCursor ?? null, 'replace');
      setAvailable(page.available);
      setDegraded(page.degraded);
      setLoading(false);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-doctor/exhaustive-deps
  }, [source, limit, filters.query, filters.level, filters.domain]);

  useEffect(() => {
    let active = true;

    void source.summarizeEvents({}).then((summary) => {
      if (!active) {
        return;
      }

      setDomainOptions(toDomainFilterOptions(summary.byDomain));
    });

    return () => {
      active = false;
    };
  }, [setDomainOptions, source]);

  useEffect(() => {
    if (selectedCorrelationId === null) {
      setTraceSiblings(NO_TRACE_SIBLINGS);

      return;
    }

    let active = true;

    void source.searchEvents({ limit, filters: { correlationId: selectedCorrelationId } }).then((page) => {
      if (!active) {
        return;
      }

      setTraceSiblings(page.items.map(toRuntimeEventRow));
    });

    return () => {
      active = false;
    };
  }, [limit, selectedCorrelationId, setTraceSiblings, source]);

  // The live listener reads the store snapshot rather than closing over React
  // state: the admission boundary, the head rows and the active filters all
  // change while one subscription is open, and re-subscribing on each of them
  // would drop pushes in the gap between teardown and re-attach.
  useEffect(() => {
    return source.subscribe((entry) => {
      const state = getNetworkStoreState();
      const row = toOverlayEventRow(entry);

      const isAdmitted = admitOverlayEntry({
        entry: row,
        head: state.head,
        headRows: selectHeadRows(state.page, state.head),
        filters: { query: state.query, level: state.levelFilter, domain: state.domainFilter },
      });

      if (isAdmitted) {
        state.prependOverlay(row);
      }
    });
  }, [source]);

  return { loadMore };
}
