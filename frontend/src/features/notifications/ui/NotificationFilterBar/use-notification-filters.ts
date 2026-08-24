import { useCallback, useState } from 'react';
import { useDebounce } from '../../../../shared/hooks/use-debounce';

/**
 * Milliseconds the search box waits after the last keystroke before
 * `debouncedSearch` moves and a fresh query fires. HeroUI's `SearchField`
 * has no built-in debounce (verified against the installed 3.2.4, design.md
 * §9.2), so this hook owns it via the existing app-wide `useDebounce`.
 */
export const NOTIFICATION_FILTER_DEBOUNCE_MS = 300;

/** The empty filter both dropdowns start from: no narrowing at all, never "match nothing". */
const NO_FILTER_APPLIED: readonly string[] = [];

/** What `useNotificationFilters` exposes to its caller. */
export interface NotificationFiltersResult {
  /** The raw, un-debounced text currently in the search box. */
  readonly searchInput: string;
  /** The same text, but only updated `NOTIFICATION_FILTER_DEBOUNCE_MS` after the last keystroke -- what a query should actually be built from. */
  readonly debouncedSearch: string;
  /** Updates `searchInput` immediately; `debouncedSearch` follows after the debounce window. */
  readonly onSearchInputChange: (value: string) => void;
  /** Levels the list is narrowed to; empty means every level. */
  readonly levels: readonly string[];
  /** Replaces the level filter with the set the user just picked. */
  readonly onLevelsChange: (levels: readonly string[]) => void;
  /** Sources the list is narrowed to; empty means every source. */
  readonly sources: readonly string[];
  /** Replaces the source filter with the set the user just picked. */
  readonly onSourcesChange: (sources: readonly string[]) => void;
  /** Whether either dropdown is currently narrowing the query -- what the empty state needs to tell "no matches" from "nothing here". */
  readonly hasFacetFilters: boolean;
}

/**
 * Owns the notification filter bar's narrowing controls: the free-text search
 * box, whose raw input updates on every keystroke (so the box itself never
 * lags) while `debouncedSearch` -- what the master-list query is actually
 * built from -- only follows after `debounceMs` of no further typing, plus
 * the level and source sets the two dropdowns hold.
 *
 * Neither dropdown is debounced: a press is a deliberate, one-at-a-time act,
 * unlike typing, so its query fires immediately.
 */
export function useNotificationFilters(debounceMs: number = NOTIFICATION_FILTER_DEBOUNCE_MS): NotificationFiltersResult {
  // 2. State
  const [searchInput, setSearchInput] = useState('');
  const [levels, setLevels] = useState<readonly string[]>(NO_FILTER_APPLIED);
  const [sources, setSources] = useState<readonly string[]>(NO_FILTER_APPLIED);

  // 3. Context/3rd-party hooks
  const debouncedSearch = useDebounce(searchInput, debounceMs);

  // 5. Derived state
  const hasFacetFilters = levels.length > 0 || sources.length > 0;

  // 6. Callbacks
  const onSearchInputChange = useCallback((value: string) => {
    setSearchInput(value);
  }, []);

  const onLevelsChange = useCallback((next: readonly string[]) => {
    setLevels(next);
  }, []);

  const onSourcesChange = useCallback((next: readonly string[]) => {
    setSources(next);
  }, []);

  return { searchInput, debouncedSearch, onSearchInputChange, levels, onLevelsChange, sources, onSourcesChange, hasFacetFilters };
}
