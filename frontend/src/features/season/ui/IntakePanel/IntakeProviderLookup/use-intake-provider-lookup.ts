import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { METADATA_LOOKUP_DEBOUNCE_MS } from '../../../../../shared/metadata-lookup/metadata-lookup.constants';
import { meetsMinimumQueryLength, normalizeLookupQuery } from '../../../../../shared/metadata-lookup/metadata-lookup.helpers';
import { PROVIDER_LOOKUP_IDLE, PROVIDER_LOOKUP_LOADING } from './intake-provider-lookup.constants';
import { requestProviderSearch, toProviderLookupSnapshot, toProviderPageViews } from './intake-provider-lookup.helpers';
import type { ProviderLookupSnapshot, ProviderSearchPort } from './intake-provider-lookup.types';

/**
 * Drives one intake row's "Find on provider" modal the way the MyAnimeList
 * lookup works: the search field is seeded from the row name on the first open
 * only, searches fire after the shared debounce once the query clears the
 * length floor, and only the newest search may land. Picking a page only
 * highlights it; confirming resolves the row to that page and closes.
 * @param rawName The row's raw name, the first open's seed.
 * @param source The provider search port.
 * @param onResolve Resolves the row to the confirmed page URL.
 * @returns The modal's open state, query, search state, page rows and handlers.
 */
export function useIntakeProviderLookup(rawName: string, source: ProviderSearchPort, onResolve: (pageUrl: string) => void) {
  // 1. Refs
  const requestSeqRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const hasSeededRef = useRef(false);

  // 2. State
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [snapshot, setSnapshot] = useState<ProviderLookupSnapshot>(PROVIDER_LOOKUP_IDLE);
  const [selectedPageUrl, setSelectedPageUrl] = useState<string | null>(null);

  // 5. Derived State
  const pages = useMemo(() => toProviderPageViews(snapshot.pages, query, selectedPageUrl), [snapshot.pages, query, selectedPageUrl]);

  // 6. Callbacks
  const runSearch = useCallback(
    async (raw: string) => {
      const normalizedQuery = normalizeLookupQuery(raw);
      // Every new query supersedes the one in flight, even one too short to search.
      // Stryker disable next-line UpdateOperator: decrementing yields an equally unique sequence number, so newest-wins holds either way.
      const seq = ++requestSeqRef.current;
      if (!meetsMinimumQueryLength(normalizedQuery)) {
        setSnapshot(PROVIDER_LOOKUP_IDLE);
        return;
      }
      setSnapshot(PROVIDER_LOOKUP_LOADING);
      const result = await requestProviderSearch(source, normalizedQuery);
      if (seq === requestSeqRef.current) {
        setSnapshot(toProviderLookupSnapshot(result));
      }
    },
    [source],
  );

  const scheduleSearch = useCallback(
    (raw: string) => {
      setQuery(raw);
      setSelectedPageUrl(null);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void runSearch(raw), METADATA_LOOKUP_DEBOUNCE_MS);
    },
    [runSearch],
  );

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
