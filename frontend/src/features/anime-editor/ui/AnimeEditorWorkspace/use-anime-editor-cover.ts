import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';
import type { AnimeEditorRecord } from '../../../../shared/contracts/anime.types';
import { ANIME_EDITOR_COVER_LOADING, ANIME_EDITOR_COVER_PLACEHOLDER } from './anime-editor-workspace.constants';
import { hasSavedAnimeCover } from './anime-editor-workspace.helpers';

/**
 * Selects the detail header's thumbnail for the selected anime's SAVED cover.
 *
 * A selector over `useAnimeEditorCovers`' cache rather than a second fetch: the
 * header and the rail row for the same anime must agree, and a second lookup
 * for an id the window already resolved would double the binding traffic for
 * the most likely selection. The saved-cover gate is re-applied here on
 * purpose -- a record whose cover was just removed falls to the shared
 * placeholder even while the cache still holds that id's previously resolved
 * thumbnail -- and it reads the saved record, so typing into the cover source
 * field moves nothing until the save reloads authority (no live draft preview).
 *
 * A saved cover with no cache entry reports `loading`, because the workspace
 * always registers the selected record's target with the same cache: the entry
 * is owed and arrives in the next effect pass.
 *
 * @param record The selected authoritative editor record, when one is loaded.
 * @param covers The rail's resolved cover cache, keyed by anime id.
 * @returns The header thumbnail's current resolution state.
 */
export function useAnimeEditorCover(record: AnimeEditorRecord | undefined, covers: ReadonlyMap<string, AnimeCoverEntry>): AnimeCoverEntry {
  // Stryker disable next-line ConditionalExpression: this guard exists to narrow `record` to
  // `AnimeEditorRecord` for the `covers.get(record.animeId)` read below -- removing it fails
  // `tsc --noEmit` with TS18048 ("'record' is possibly 'undefined'"). It is runtime-equivalent:
  // `hasSavedAnimeCover(undefined)` is false by construction (it reads `record?.details.cover?.path`),
  // so the second operand decides identically and no test can distinguish its removal.
  if (record === undefined || !hasSavedAnimeCover(record)) {
    return ANIME_EDITOR_COVER_PLACEHOLDER;
  }
  return covers.get(record.animeId) ?? ANIME_EDITOR_COVER_LOADING;
}
