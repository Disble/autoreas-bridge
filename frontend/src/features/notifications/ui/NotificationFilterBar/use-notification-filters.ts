import { useCallback, useState } from 'react';
import { useDebounce } from '../../../../shared/hooks/use-debounce';

/**
 * Milliseconds the search box waits after the last keystroke before
 * `debouncedSearch` moves and a fresh query fires. HeroUI's `SearchField`
 * has no built-in debounce (verified against the installed 3.2.4, design.md
 * §9.2), so this hook owns it via the existing app-wide `useDebounce`.
 */
export const NOTIFICATION_FILTER_DEBOUNCE_MS = 300;

/** What `useNotificationFilters` exposes to its caller. */
export interface NotificationFiltersResult {
  /** The raw, un-debounced text currently in the search box. */
  readonly searchInput: string;
  /** The same text, but only updated `NOTIFICATION_FILTER_DEBOUNCE_MS` after the last keystroke -- what a query should actually be built from. */
  readonly debouncedSearch: string;
  /** Updates `searchInput` immediately; `debouncedSearch` follows after the debounce window. */
  readonly onSearchInputChange: (value: string) => void;
}

/**
 * Owns the notification filter bar's free-text search box: the raw input
 * updates on every keystroke (so the box itself never lags), while
 * `debouncedSearch` -- what the master-list query is actually built from --
 * only follows after `debounceMs` of no further typing.
 */
export function useNotificationFilters(debounceMs: number = NOTIFICATION_FILTER_DEBOUNCE_MS): NotificationFiltersResult {
  // 2. State
  const [searchInput, setSearchInput] = useState('');

  // 3. Context/3rd-party hooks
  const debouncedSearch = useDebounce(searchInput, debounceMs);

  // 6. Callbacks
  const onSearchInputChange = useCallback((value: string) => {
    setSearchInput(value);
  }, []);

  return { searchInput, debouncedSearch, onSearchInputChange };
}
