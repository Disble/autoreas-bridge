import { useCallback } from 'react';
import type { AnimeMetadataCandidate, AnimeMetadataSelection, LookupState } from '../../metadata-lookup.types';
import type { AnimeMetadataLookupSource, MyAnimeListDetailResultDTO } from './anime-metadata-lookup.types';
import { useAnimeMetadataLookupSearch } from './use-anime-metadata-lookup-search';
import { useAnimeMetadataLookupSelection } from './use-anime-metadata-lookup-selection';

/**
 * Re-exported at this path for backward compatibility: several features and
 * tests import the lookup's request-port contract from `use-anime-metadata-lookup`
 * directly, and moving the interfaces into `anime-metadata-lookup.types.ts`
 * (fallow complexity guard) must not force every one of those imports to move.
 */
export type {
  AnimeMetadataLookupSource,
  MyAnimeListDetailResultDTO,
  MyAnimeListSearchResultDTO,
} from './anime-metadata-lookup.types';

/** Everything `useAnimeMetadataLookup` hands back to its caller. */
export interface UseAnimeMetadataLookupResult {
  readonly query: string;
  readonly state: LookupState;
  readonly candidates: readonly AnimeMetadataCandidate[];
  readonly errorMessage: string;
  /** The candidate the user has highlighted, before confirming (task 5b.2's "modal's selection state"). */
  readonly selectedMalId: number | null;
  /** `GetMyAnimeListDetail`'s own message when the last confirm attempt failed; `''` otherwise. */
  readonly confirmError: string;
  readonly onQueryChange: (raw: string) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Highlights a candidate. Writes nothing and fetches nothing on its own (non-negotiable #5, UI half). */
  readonly onSelectCandidate: (malId: number) => void;
  readonly confirmCandidate: (malId: number) => Promise<MyAnimeListDetailResultDTO>;
  /**
   * The sole path from a highlighted candidate to a mapped selection: fetches
   * the currently selected candidate's detail page and maps it through
   * `toAnimeMetadataSelection`, merging in that candidate's own search-payload
   * image as `coverURL`. Resolves to `undefined`, and sets `confirmError`,
   * when nothing is selected or the fetch itself failed.
   */
  readonly onConfirmSelection: () => Promise<AnimeMetadataSelection | undefined>;
}

/**
 * Drives the metadata lookup modal's search (design D4/D7/D8) and selection
 * (non-negotiable #5) by composing `useAnimeMetadataLookupSearch` and
 * `useAnimeMetadataLookupSelection` (split out of this hook, fallow
 * complexity guard). Wires the one dependency between the two halves: a new
 * query invalidates whatever candidate was highlighted under the previous
 * one, and any confirm failure that was reported against it.
 * @param name The feature's current draft name, forwarded to the search half
 * for first-open-only seeding.
 * @param source The lookup's two Wails-bound calls, injected so a test can
 * supply a fake.
 * @returns The current query/snapshot/selection plus the handlers the modal
 * wires up.
 */
export function useAnimeMetadataLookup(
  name: string,
  source: AnimeMetadataLookupSource,
): UseAnimeMetadataLookupResult {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const search = useAnimeMetadataLookupSearch(name, source);
  const selection = useAnimeMetadataLookupSelection(source, search.candidates);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onQueryChange = useCallback(
    (raw: string) => {
      // A new query invalidates whatever candidate was highlighted under the
      // previous one, and any confirm failure that was reported against it.
      selection.resetSelection();
      search.onQueryChange(raw);
    },
    [search.onQueryChange, selection.resetSelection],
  );

  // 7. Effects

  return {
    query: search.query,
    state: search.state,
    candidates: search.candidates,
    errorMessage: search.errorMessage,
    selectedMalId: selection.selectedMalId,
    confirmError: selection.confirmError,
    onQueryChange,
    onOpenChange: search.onOpenChange,
    onSelectCandidate: selection.onSelectCandidate,
    confirmCandidate: selection.confirmCandidate,
    onConfirmSelection: selection.onConfirmSelection,
  };
}
