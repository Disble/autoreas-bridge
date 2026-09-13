import { useCallback, useState } from 'react';
import { toAnimeMetadataSelection } from '../../metadata-lookup.helpers';
import type { AnimeMetadataCandidate, AnimeMetadataSelection } from '../../metadata-lookup.types';
import type { AnimeMetadataLookupSource, MyAnimeListDetailResultDTO } from './anime-metadata-lookup.types';

/** Everything `useAnimeMetadataLookupSelection` hands back to its caller. */
export interface UseAnimeMetadataLookupSelectionResult {
  /** The candidate the user has highlighted, before confirming (task 5b.2's "modal's selection state"). */
  readonly selectedMalId: number | null;
  /** `GetMyAnimeListDetail`'s own message when the last confirm attempt failed; `''` otherwise. */
  readonly confirmError: string;
  /** Highlights a candidate. Writes nothing and fetches nothing on its own (non-negotiable #5, UI half). */
  readonly onSelectCandidate: (malId: number) => void;
  readonly confirmCandidate: (malId: number) => Promise<MyAnimeListDetailResultDTO>;
  /**
   * The sole path from a highlighted candidate to a mapped selection: fetches
   * the currently selected candidate's detail page and maps it through
   * {@link toAnimeMetadataSelection}, merging in that candidate's own
   * search-payload image as `coverURL`. Resolves to `undefined`, and sets
   * `confirmError`, when nothing is selected or the fetch itself failed.
   */
  readonly onConfirmSelection: () => Promise<AnimeMetadataSelection | undefined>;
  /** Clears the highlighted candidate and any confirm error. The search half's owning hook calls this when the query changes. */
  readonly resetSelection: () => void;
}

/**
 * Drives the metadata lookup modal's selection half: highlighting a
 * candidate and the sole confirm path to `GetMyAnimeListDetail`
 * (non-negotiable #5). Split out of `useAnimeMetadataLookup` (fallow
 * complexity guard) -- the search half lives in
 * `useAnimeMetadataLookupSearch`, and `useAnimeMetadataLookup` composes both,
 * wiring the one dependency between them (a new query invalidates the
 * previous selection, through `resetSelection`).
 * @param source The lookup's `GetMyAnimeListDetail` call, injected so a test
 * can supply a fake.
 * @param candidates The search half's current candidate list, read only to
 * find the highlighted candidate's own search-payload image.
 * @returns The current selection plus the handlers the modal wires up.
 */
export function useAnimeMetadataLookupSelection(
  source: Pick<AnimeMetadataLookupSource, 'GetMyAnimeListDetail'>,
  candidates: readonly AnimeMetadataCandidate[],
): UseAnimeMetadataLookupSelectionResult {
  // 1. Refs

  // 2. State
  const [selectedMalId, setSelectedMalId] = useState<number | null>(null);
  const [confirmError, setConfirmError] = useState('');

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const confirmCandidate = useCallback(
    (malId: number) => source.GetMyAnimeListDetail(malId),
    [source],
  );

  const onSelectCandidate = useCallback((malId: number) => {
    setSelectedMalId(malId);
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedMalId(null);
    setConfirmError('');
  }, []);

  const onConfirmSelection = useCallback(async (): Promise<AnimeMetadataSelection | undefined> => {
    if (selectedMalId === null) {
      return undefined;
    }
    setConfirmError('');
    const selectedCandidate = candidates.find((candidate) => candidate.malId === selectedMalId);
    const result = await confirmCandidate(selectedMalId);
    if (result.outcome === 'error') {
      setConfirmError(result.message);
      return undefined;
    }
    return toAnimeMetadataSelection({
      title: result.title ?? '',
      type: result.type,
      episodes: result.episodes,
      duration: result.duration,
      source: result.source,
      genres: result.genres,
      studios: result.studios,
      coverURL: selectedCandidate?.image,
    });
  }, [selectedMalId, candidates, confirmCandidate]);

  // 7. Effects

  return { selectedMalId, confirmError, onSelectCandidate, confirmCandidate, onConfirmSelection, resetSelection };
}
