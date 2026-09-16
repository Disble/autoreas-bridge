import { useState } from 'react';
import { useDebounce } from '../../../../shared/hooks/use-debounce';

/** Milliseconds `HistoryFilterBar`'s Search draft waits before `debouncedSearch` follows (design D5). */
export const HISTORY_FILTER_BAR_SEARCH_DEBOUNCE_MS = 300;

/** What `useHistoryFilterBarSearch` exposes to whichever hook wires `HistoryFilterBar` into the URL. */
export interface UseHistoryFilterBarSearchResult {
  /** The draft text to pass into `HistoryFilterBar`'s `search` prop; updates on every keystroke. */
  readonly draft: string;
  /** `draft`, `debounceMs` after the last keystroke -- the caller commits this to the URL once it differs from the currently committed value. */
  readonly debouncedSearch: string;
  /** Pass straight through as `HistoryFilterBar`'s `onSearchChange`. */
  readonly onDraftChange: (value: string) => void;
}

/**
 * Owns `HistoryFilterBar`'s Search draft, kept out of the dumb `.tsx` itself
 * (CLAUDE.md FE #1: no `useEffect`, no business logic in a feature
 * component). `draft` updates on every keystroke so the input never lags;
 * `debouncedSearch` only follows `debounceMs` after the last keystroke. This
 * mirrors `useNotificationFilters`'s `debouncedSearch` -- the caller reads
 * the settled value and decides when to commit it (`useHistoryParams`'s
 * `setSearch`), rather than this hook pushing it up through an effect.
 *
 * `committedSearch` changing from OUTSIDE this hook (Back/Forward
 * navigation) resyncs `draft` through a render-phase reset against the
 * previously seen value -- never an effect, the stale-param lesson recorded
 * in autoreas-theme `1.0.11` -- discarding any not-yet-committed keystrokes.
 */
export function useHistoryFilterBarSearch(
  committedSearch: string,
  debounceMs: number = HISTORY_FILTER_BAR_SEARCH_DEBOUNCE_MS,
): UseHistoryFilterBarSearchResult {
  // 2. State
  const [draft, setDraft] = useState(committedSearch);
  const [seenCommittedSearch, setSeenCommittedSearch] = useState(committedSearch);

  // Render-phase reset (never an effect): an externally changed
  // `committedSearch` overrides any in-progress, not-yet-committed draft.
  if (committedSearch !== seenCommittedSearch) {
    setSeenCommittedSearch(committedSearch);
    setDraft(committedSearch);
  }

  // 3. Context/3rd Party Hooks
  const debouncedSearch = useDebounce(draft, debounceMs);

  return { draft, debouncedSearch, onDraftChange: setDraft };
}
