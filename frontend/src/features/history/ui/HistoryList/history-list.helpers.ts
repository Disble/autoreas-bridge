import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { Anime, AnimeRepeticion } from '../../../../shared/contracts/anime.types';
import { HISTORY_LIST_UNKNOWN_DATE_LABEL } from './history-list.constants';
import type {
  HistoryCandidate,
  HistoryEntryViewModel,
  HistoryRepetitionViewModel,
} from './history-list.types';

/**
 * Builds a human-readable progress label, mirroring the Catalog panel's
 * `formatAnimeProgress` (duplicated per this repo's convention of small,
 * feature-local pure formatters rather than a shared cross-feature import).
 */
export function formatHistoryProgress(current: number, total?: number): string {
  return total === undefined ? `${current} / ?` : `${current} / ${total}`;
}

/**
 * Formats an epoch-millis date into a stable `YYYY-MM-DD` label. Returns the
 * "Unknown" fallback when the millis are missing (legacy null date).
 */
export function formatHistoryRepetitionDate(millis?: number): string {
  if (millis === undefined) {
    return HISTORY_LIST_UNKNOWN_DATE_LABEL;
  }

  return new Date(millis).toISOString().slice(0, 10);
}

/**
 * Behavior decision (design.md Phase 3.1, resolved before writing this list
 * hook): "in-progress" means started but not finished -- nonzero watched
 * count strictly below the total. A missing `totalcap` cannot be strictly
 * "below total", so it is treated as not-in-progress (mirrors
 * `formatAnimeProgress`'s "?" fallback for an unknown total elsewhere in the
 * catalog code).
 */
export function isHistoryInProgress(candidate: Pick<HistoryCandidate, 'nrocapvisto' | 'totalcap'>): boolean {
  return (
    candidate.totalcap !== undefined &&
    candidate.nrocapvisto > 0 &&
    candidate.nrocapvisto < candidate.totalcap
  );
}

/** Returns true when the candidate has at least one repetition-history entry. */
export function hasRepetitionHistory(candidate: Pick<HistoryCandidate, 'repetir'>): boolean {
  return (candidate.repetir ?? []).length > 0;
}

/**
 * Cheap prefilter over the slim `Anime` list (no `GetAnimeDetail` fetch
 * needed): the slim DTO from `getAnimes` carries `nrocapvisto`/`totalcap`
 * but NOT `repetir` (design Decision 4 -- the timeline is a detail-only
 * concern). Any anime with nonzero progress -- whether still in-progress or
 * already complete -- is worth a per-item `getAnimeDetail` fetch to check for
 * genuine History membership via `qualifiesForHistory` below.
 *
 * KNOWN LIMITATION (documented data-source gap, not a silent oversight): an
 * anime whose CURRENT `nrocapvisto` is exactly 0 but which still carries
 * `repetir` entries from an earlier watch cycle will not be detected, since
 * its detail is never fetched. Closing this fully would require either a
 * bulk repetition-history field on the slim list DTO (rejected by design
 * Decision 4, which explicitly keeps the list lightweight) or fetching
 * `GetAnimeDetail` for the entire catalog (defeats the same "lightweight
 * list" intent and does not scale). Deferred to a future slice/endpoint if
 * this proves to matter in practice.
 */
export function isHistoryDetailCandidate(candidate: Pick<HistoryCandidate, 'nrocapvisto'>): boolean {
  return candidate.nrocapvisto > 0;
}

/**
 * Final History-membership rule, applied once a candidate's detail (and
 * therefore its `repetir` timeline) has been fetched: qualifies when the
 * anime HAS at least one repetition entry OR is currently in-progress.
 * Explicitly NOT "all animes" -- a candidate with zero progress and no
 * repetition history never appears in History.
 */
export function qualifiesForHistory(candidate: HistoryCandidate): boolean {
  return isHistoryInProgress(candidate) || hasRepetitionHistory(candidate);
}

/**
 * Timeline ordering (design.md Phase 3.1 decision): most-recent
 * `fechaRepeticion` first (desc) within a card. Entries with an
 * absent/null `fechaRepeticion` (degraded legacy date) sort last.
 */
export function sortRepetitionsByRecency(
  repetitions: readonly AnimeRepeticion[],
): readonly AnimeRepeticion[] {
  return repetitions.toSorted((a, b) => {
    if (a.fechaRepeticion === undefined) {
      return b.fechaRepeticion === undefined ? 0 : 1;
    }
    if (b.fechaRepeticion === undefined) {
      return -1;
    }
    return b.fechaRepeticion - a.fechaRepeticion;
  });
}

/** Maps a single legacy repetition entry into its History card view model. */
export function toHistoryRepetitionViewModel(
  entry: AnimeRepeticion,
  index: number,
): HistoryRepetitionViewModel {
  return {
    key: `${entry.numrepeticion}-${index}`,
    numRepeticion: entry.numrepeticion,
    repeatedOnLabel: formatHistoryRepetitionDate(entry.fechaRepeticion),
  };
}

/**
 * Converts a qualifying candidate into the view model rendered by a History
 * card. `repetir` is optional on the wire (Go's `omitempty` drops the key
 * for anime with no repetition history), so it MUST be defaulted with
 * `?? []` here rather than assumed present.
 */
export function buildHistoryEntry(candidate: HistoryCandidate): HistoryEntryViewModel {
  const repetitions = sortRepetitionsByRecency(candidate.repetir ?? []).map(toHistoryRepetitionViewModel);

  return {
    id: candidate.id,
    nombre: candidate.nombre,
    progressLabel: formatHistoryProgress(candidate.nrocapvisto, candidate.totalcap),
    repetitionCount: repetitions.length,
    repetitions,
  };
}

/** Sorts History cards alphabetically by name, using the id as a stable tie-breaker. */
export function sortHistoryEntriesByName(a: HistoryEntryViewModel, b: HistoryEntryViewModel): number {
  const nameA = a.nombre.toLowerCase();
  const nameB = b.nombre.toLowerCase();
  if (nameA !== nameB) {
    return nameA < nameB ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Fetches the slim catalog, then enriches only the progress-qualifying
 * candidates (`isHistoryDetailCandidate`) with their `repetir` timeline via
 * a per-item `getAnimeDetail` fetch -- the slim `getAnimes` payload does not
 * carry `repetir` (design Decision 4: the timeline is a detail-only
 * concern), so this two-step fetch is the lightest way to apply the full
 * "in-progress OR has-repetir" membership rule without a new backend
 * endpoint. See `isHistoryDetailCandidate` above for the documented edge
 * case this approximation does not cover.
 */
export async function loadHistoryEntries(source: BridgeRuntimeSource): Promise<readonly HistoryEntryViewModel[]> {
  const items = await source.getAnimes();
  const detailCandidates = items.filter((item) => isHistoryDetailCandidate(item));

  const candidates: readonly HistoryCandidate[] = await Promise.all(
    detailCandidates.map(async (item: Anime) => {
      const detail = await source.getAnimeDetail(item.id);

      return {
        id: item.id,
        nombre: item.nombre,
        nrocapvisto: item.nrocapvisto,
        totalcap: item.totalcap,
        repetir: detail?.repetir,
      };
    }),
  );

  return candidates
    .filter(qualifiesForHistory)
    .map(buildHistoryEntry)
    .toSorted(sortHistoryEntriesByName);
}

/**
 * Formats the repetition-count badge label for a History card, pluralizing
 * "repetition"/"repetitions" naturally.
 */
export function formatHistoryRepetitionCountLabel(count: number): string {
  return count === 1 ? '1 repetition' : `${count} repetitions`;
}
