import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { METADATA_LOOKUP_DEBOUNCE_MS } from '../../../../../shared/metadata-lookup/metadata-lookup.constants';
import { meetsMinimumQueryLength } from '../../../../../shared/metadata-lookup/metadata-lookup.helpers';
import { BRIDGE_SEASON_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { seasonKeys } from '../../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../../shared/query/use-bridge-query/use-bridge-query';
import { PROVIDER_SEARCH_NONE } from './intake-provider-lookup.constants';
import { fetchProviderSearch, nextProviderSearch, toProviderLookupSnapshot, toProviderPageViews } from './intake-provider-lookup.helpers';
import type { ProviderSearchPort, ProviderSearchRequest } from './intake-provider-lookup.types';

/**
 * Drives one intake row's "Find on provider" modal the way the MyAnimeList
 * lookup works: the search field is seeded from the row name on the first open
 * only, searches fire after the shared debounce once the query clears the
 * length floor, and only the newest search may land. Each settled debounce is
 * its own `useBridgeQuery` search on the season module, so the lookup shows
 * loading while that module starts and its failure once it failed. Picking a
 * page only highlights it; confirming resolves the row to that page and closes.
 * @param rawName The row's raw name, the first open's seed.
 * @param onResolve Resolves the row to the confirmed page URL.
 * @param source The provider search port.
 * @returns The modal's open state, query, search state, page rows and handlers.
 */
export function useIntakeProviderLookup(
  rawName: string,
  onResolve: (pageUrl: string) => void,
  source: ProviderSearchPort = BRIDGE_SEASON_SOURCE,
) {
  // 1. Refs
  const timerRef = useRef<number | undefined>(undefined);
  const hasSeededRef = useRef(false);

  // 2. State
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<ProviderSearchRequest>(PROVIDER_SEARCH_NONE);
  const [selectedPageUrl, setSelectedPageUrl] = useState<string | null>(null);

  // 4. Queries/Mutations
  // The sequence number keys every search apart, so only the newest one is shown;
  // a superseded search has no reader left and is dropped at once.
  const read = useBridgeQuery({
    queryKey: seasonKeys.key('provider-search', search.query, search.seq),
    queryFn: () => fetchProviderSearch(source, search.query),
    module: 'season',
    enabled: meetsMinimumQueryLength(search.query),
    gcTime: 0,
  });

  // 5. Derived State
  const snapshot = toProviderLookupSnapshot(search.query, read);
  const pages = useMemo(() => toProviderPageViews(snapshot.pages, query, selectedPageUrl), [snapshot.pages, query, selectedPageUrl]);

  // 6. Callbacks
  const scheduleSearch = useCallback((raw: string) => {
    setQuery(raw);
    setSelectedPageUrl(null);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setSearch((current) => nextProviderSearch(current, raw)), METADATA_LOOKUP_DEBOUNCE_MS);
  }, []);

  const onOpenChange = useCallback(
    (nextIsOpen: boolean) => {
      setIsOpen(nextIsOpen);
      if (nextIsOpen && !hasSeededRef.current) {
        hasSeededRef.current = true;
        scheduleSearch(rawName);
      }
    },
    [rawName, scheduleSearch],
  );

  const onConfirm = useCallback(() => {
    if (selectedPageUrl === null) {
      return;
    }
    onResolve(selectedPageUrl);
    setIsOpen(false);
  }, [onResolve, selectedPageUrl]);

  // 7. Effects
  // Stryker disable ArrayDeclaration: `[]` and a constant literal such as `["Stryker was here"]` are
  // both render-constant, so the cleanup runs only on unmount under either array.
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  // Stryker restore ArrayDeclaration

  return {
    isOpen,
    query,
    state: snapshot.state,
    errorMessage: snapshot.errorMessage,
    pages,
    hasPages: pages.length > 0,
    isConfirmDisabled: selectedPageUrl === null,
    onOpenChange,
    onQueryChange: scheduleSearch,
    onSelectPage: setSelectedPageUrl,
    onConfirm,
  };
}
