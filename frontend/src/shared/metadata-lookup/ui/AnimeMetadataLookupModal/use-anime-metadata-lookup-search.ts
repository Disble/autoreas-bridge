import { useCallback, useEffect, useRef, useState } from 'react';
import { METADATA_LOOKUP_DEBOUNCE_MS } from '../../metadata-lookup.constants';
import { meetsMinimumQueryLength, normalizeLookupQuery } from '../../metadata-lookup.helpers';
import type { AnimeMetadataCandidate, LookupState } from '../../metadata-lookup.types';
import type { AnimeMetadataLookupSource } from './anime-metadata-lookup.types';

/**
 * One immutable snapshot of the lookup's search state (design D8) -- a single
 * discriminant plus the data that belongs to it, so no reachable state can
 * carry `loading` alongside a stale `candidates` list from the previous query.
 */
interface LookupSnapshot {
  readonly state: LookupState;
  readonly candidates: readonly AnimeMetadataCandidate[];
  readonly errorMessage: string;
}

/** The snapshot for a query that has not searched yet, or fell below the floor. */
const IDLE_SNAPSHOT: LookupSnapshot = { state: 'idle', candidates: [], errorMessage: '' };

/**
 * Builds the snapshot for a request in flight.
 * @returns A `loading` snapshot with no candidates and no error.
 */
function loadingSnapshot(): LookupSnapshot {
  return { state: 'loading', candidates: [], errorMessage: '' };
}

/**
 * Builds the snapshot for a request that resolved successfully.
 * @param candidates The candidates the search returned (possibly empty).
 * @returns A `resolved` snapshot carrying `candidates`.
 */
function resolvedSnapshot(candidates: readonly AnimeMetadataCandidate[]): LookupSnapshot {
  return { state: 'resolved', candidates, errorMessage: '' };
}

/**
 * Builds the snapshot for a request MyAnimeList's own binding reported as
 * `AnimePatchOutcomeError`.
 * @param errorMessage The binding's own message, naming the failing anchor
 * when the cause was markup drift.
 * @returns A `failed` snapshot with no candidates.
 */
function failedSnapshot(errorMessage: string): LookupSnapshot {
  return { state: 'failed', candidates: [], errorMessage };
}

/** Everything `useAnimeMetadataLookupSearch` hands back to its caller. */
export interface UseAnimeMetadataLookupSearchResult {
  readonly query: string;
  readonly state: LookupState;
  readonly candidates: readonly AnimeMetadataCandidate[];
  readonly errorMessage: string;
  readonly onQueryChange: (raw: string) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
}

/**
 * Drives the metadata lookup modal's search half: debounced, newest-wins,
 * normalized-query cache (design D7), gated behind a script-aware minimum
 * length (D7a), with first-open-only seeding. No effect drives the search
 * itself; the caller fires it from the search field's change handler
 * (`onQueryChange`) and from the modal's own open handler (`onOpenChange`).
 * Split out of `useAnimeMetadataLookup` (fallow complexity guard) -- the
 * selection half lives in `useAnimeMetadataLookupSelection`, and
 * `useAnimeMetadataLookup` composes both, wiring the one dependency between
 * them (a new query invalidates the previous selection).
 * @param name The feature's current draft name, seeded into the query on the
 * modal's first open only (`hasSeededRef`) -- a later reopen never overwrites
 * whatever the user has since typed.
 * @param source The lookup's `SearchMyAnimeList` call, injected so a test can
 * supply a fake.
 * @returns The current query/snapshot plus the handlers the modal wires up.
 */
export function useAnimeMetadataLookupSearch(
  name: string,
  source: Pick<AnimeMetadataLookupSource, 'SearchMyAnimeList'>,
): UseAnimeMetadataLookupSearchResult {
  // 1. Refs
  const requestSeqRef = useRef(0);
  const cacheRef = useRef(new Map<string, readonly AnimeMetadataCandidate[]>());
  const timerRef = useRef<number | undefined>(undefined);
  const hasSeededRef = useRef(false);

  // 2. State
  const [query, setQuery] = useState('');
  const [snapshot, setSnapshot] = useState<LookupSnapshot>(IDLE_SNAPSHOT);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const runSearch = useCallback(
    async (raw: string) => {
      const normalizedQuery = normalizeLookupQuery(raw);
      if (!meetsMinimumQueryLength(normalizedQuery)) {
        setSnapshot(IDLE_SNAPSHOT);
        return;
      }
      const cached = cacheRef.current.get(normalizedQuery);
      if (cached !== undefined) {
        setSnapshot(resolvedSnapshot(cached));
        return;
      }
      const seq = ++requestSeqRef.current;
      setSnapshot(loadingSnapshot());
      const result = await source.SearchMyAnimeList(normalizedQuery);
      if (seq !== requestSeqRef.current) {
        // A newer request already landed -- this response is stale, drop it.
        return;
      }
      if (result.outcome === 'error') {
        setSnapshot(failedSnapshot(result.message));
        return;
      }
      const candidates = result.candidates ?? [];
      cacheRef.current.set(normalizedQuery, candidates);
      setSnapshot(resolvedSnapshot(candidates));
    },
    [source],
  );

  const scheduleSearch = useCallback(
    (raw: string) => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void runSearch(raw);
      }, METADATA_LOOKUP_DEBOUNCE_MS);
    },
    [runSearch],
  );

  const onQueryChange = useCallback(
    (raw: string) => {
      setQuery(raw);
      scheduleSearch(raw);
    },
    [scheduleSearch],
  );

  const onOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen || hasSeededRef.current) {
        return;
      }
      hasSeededRef.current = true;
      setQuery(name);
      scheduleSearch(name);
    },
    [name, scheduleSearch],
  );

  // 7. Effects
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { query, state: snapshot.state, candidates: snapshot.candidates, errorMessage: snapshot.errorMessage, onQueryChange, onOpenChange };
}
