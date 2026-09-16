import {
  METADATA_LOOKUP_EPISODES_UNKNOWN_LITERAL,
  METADATA_LOOKUP_KIND_MAP,
  METADATA_LOOKUP_MIN_LENGTH_LATIN,
  METADATA_LOOKUP_MIN_LENGTH_WIDE,
} from './metadata-lookup.constants';
import type { AnimeMetadataCandidate, AnimeMetadataDetail, AnimeMetadataSelection } from './metadata-lookup.types';

/**
 * Normalizes a raw search-field value into the lookup hook's cache key
 * (design D7). Case-folded and collapsed to single spaces so re-typing the
 * same query, or one that only differs by surrounding whitespace, hits the
 * same cache entry and spares a Wails round trip.
 * @param raw The value straight out of the modal's search field.
 * @returns The normalized form, safe to use as a cache key.
 */
export function normalizeLookupQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Whether a query carries enough signal to search. The floor is 2 when the
 * query contains any non-Basic-Latin code point and 3 otherwise, because a
 * character's information content is script-dependent (design D7a, measured
 * against MyAnimeList's own search endpoint -- two CJK characters already
 * return an exact, complete title, while two Latin letters return noise).
 * @param query The query to test (normalized or raw -- the floor does not
 * care which, since it only inspects code points).
 * @returns Whether `query` clears its script-aware floor.
 */
export function meetsMinimumQueryLength(query: string): boolean {
  const codePoints = [...query];
  const hasNonLatin = codePoints.some((character) => (character.codePointAt(0) ?? 0) > 127);
  const floor = hasNonLatin ? METADATA_LOOKUP_MIN_LENGTH_WIDE : METADATA_LOOKUP_MIN_LENGTH_LATIN;
  return codePoints.length >= floor;
}

/**
 * Case-folds and strips punctuation from a title for similarity comparison,
 * so that "Jujutsu Kaisen:" and "jujutsu kaisen" compare as the same words.
 * @param text A raw title or query.
 * @returns The folded form, with runs of non-alphanumeric characters
 * collapsed to a single space and outer whitespace trimmed.
 */
function foldForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Counts the Levenshtein edit distance between two strings -- the minimum
 * number of single-character insertions, deletions, or substitutions that
 * turns `a` into `b`.
 * @param a The first string.
 * @param b The second string.
 * @returns The edit distance between `a` and `b`.
 */
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const columns = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) {
    distances[row][0] = row;
  }
  for (let column = 0; column < columns; column += 1) {
    distances[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + cost,
      );
    }
  }

  return distances[rows - 1][columns - 1];
}

/**
 * Scores how closely a title matches a query, as a value between 0 (no
 * resemblance) and 1 (identical once folded).
 * @param title A candidate's title, already folded.
 * @param query The query, already folded.
 * @returns The normalized similarity ratio.
 */
function similarityRatio(title: string, query: string): number {
  const longest = Math.max(title.length, query.length, 1);
  return 1 - levenshteinDistance(title, query) / longest;
}

/**
 * Re-scores MyAnimeList's own search results by string similarity to the
 * typed query, for presentation order only (design D11). MyAnimeList's own
 * ranking is Elasticsearch-backed and can rank a same-franchise sequel
 * above the title the user actually typed; the user always confirms one
 * candidate, so this never changes which candidates are offered -- only
 * where the eye lands first. `AnimeMetadataCandidate` carries exactly one
 * title-bearing field today (`name`); this is the only variant scored.
 * @param candidates The candidates in MyAnimeList's own order.
 * @param query The query the user typed (raw or normalized).
 * @returns A new array holding the same candidates, most similar first.
 */
export function rankCandidates(
  candidates: readonly AnimeMetadataCandidate[],
  query: string,
): readonly AnimeMetadataCandidate[] {
  const foldedQuery = foldForComparison(query);

  const scored = candidates.map((candidate) => ({
    candidate,
    score: similarityRatio(foldForComparison(candidate.name), foldedQuery),
  }));

  scored.sort((left, right) => right.score - left.score);

  return scored.map((entry) => entry.candidate);
}

/**
 * Builds the pre-image of `patch`'s own keys from `draft` (design D9). Undo
 * replays the returned patch through the same channel the user's own typing
 * uses, reverting exactly the fields `patch` touched -- never the full
 * draft, which would also roll back edits made to other fields after the
 * autofill.
 * @param draft The feature's current draft, before `patch` is applied.
 * @param patch The metadata patch about to be applied.
 * @returns A patch of the same shape as `patch`, holding `draft`'s current
 * value for each of `patch`'s keys.
 */
export function buildUndoPatch<TDraft, TPatch extends Partial<TDraft>>(
  draft: TDraft,
  patch: TPatch,
): TPatch {
  const previous = {} as TPatch;
  for (const key of Object.keys(patch) as (keyof TPatch)[]) {
    previous[key] = draft[key as unknown as keyof TDraft] as unknown as TPatch[keyof TPatch];
  }
  return previous;
}

/**
 * Joins a MyAnimeList label's multiple values (genres, studios) into the
 * bridge form's single comma-separated field, or reports it unfilled when
 * the label was legitimately absent from the page.
 * @param values The label's parsed values, or `undefined`/empty when absent.
 * @param field The bridge field name to report in `unfilled` when empty.
 * @param unfilled The selection's own `unfilled` accumulator to push onto.
 * @returns The joined string, or `undefined` when `values` was empty.
 */
function joinMappedList(
  values: readonly string[] | undefined,
  field: string,
  unfilled: string[],
): string | undefined {
  if (values === undefined || values.length === 0) {
    unfilled.push(field);
    return undefined;
  }
  return values.join(', ');
}

/**
 * Reads a mapped single-value field, reporting it unfilled when MyAnimeList
 * legitimately omitted it.
 * @param value The label's raw text, or `undefined`/empty when absent.
 * @param field The bridge field name to report in `unfilled` when empty.
 * @param unfilled The selection's own `unfilled` accumulator to push onto.
 * @returns `value` unchanged, or `undefined` when it was empty.
 */
function readMappedValue(
  value: string | undefined,
  field: string,
  unfilled: string[],
): string | undefined {
  if (value === undefined || value === '') {
    unfilled.push(field);
    return undefined;
  }
  return value;
}

/**
 * Maps `detail`'s `Episodes:` value to `totalEpisodes`. Digits map through
 * unchanged; an absent or literal `Unknown` value reports `totalEpisodes`
 * unfilled rather than writing a defaulted count (design's Field Mapping
 * table -- `internal/myanimelist/detail.go` already treats `Unknown` as a
 * legitimate absence, so this check is defense in depth, not the only gate).
 * @param episodes `detail.episodes`.
 * @param unfilled The selection's own `unfilled` accumulator to push onto.
 * @returns `episodes` unchanged, or `undefined` when it carries no count.
 */
function readTotalEpisodes(episodes: string | undefined, unfilled: string[]): string | undefined {
  if (episodes === undefined || episodes === '' || episodes === METADATA_LOOKUP_EPISODES_UNKNOWN_LITERAL) {
    unfilled.push('totalEpisodes');
    return undefined;
  }
  return episodes;
}

/**
 * Maps `detail.type` through the closed four-value bridge `kind` enum
 * (non-negotiable #6). An unmapped MyAnimeList type -- `ONA`, `Music`, or
 * anything this change has not seen -- leaves `kind` unset and reports it
 * unfilled; it is never filed as `'0'` (TV).
 * @param type `detail.type`.
 * @param unfilled The selection's own `unfilled` accumulator to push onto.
 * @returns The mapped bridge `kind` value, or `undefined` when unmapped.
 */
function readKind(type: string | undefined, unfilled: string[]): string | undefined {
  const kind = type === undefined ? undefined : METADATA_LOOKUP_KIND_MAP[type];
  if (kind === undefined) {
    unfilled.push('kind');
  }
  return kind;
}

/**
 * Performs hop one of the MAL-to-bridge translation (design's Technical
 * Approach and Field Mapping table): turns a confirmed candidate's detail
 * page, still in MyAnimeList's own vocabulary, into the neutral
 * {@link AnimeMetadataSelection} each feature's own hop-two mapper then
 * reads. `detail` carries no `status` field at all, so MyAnimeList's airing
 * `Status:` has no path into the returned selection -- that is what makes
 * the estado mapping trap structurally unavailable rather than merely
 * documented. This function also never reads or writes a download page,
 * folder, watched-episode count, watching estado, or premiere date; those
 * are feature-owned, protected fields no shared hop may touch.
 * @param detail The confirmed candidate's mapped MyAnimeList fields, plus
 * the cover URL merged in from the search payload.
 * @returns The normalized, source-agnostic selection.
 */
export function toAnimeMetadataSelection(detail: AnimeMetadataDetail): AnimeMetadataSelection {
  const unfilled: string[] = [];

  const kind = readKind(detail.type, unfilled);
  const totalEpisodes = readTotalEpisodes(detail.episodes, unfilled);
  const duration = readMappedValue(detail.duration, 'duration', unfilled);
  const origin = readMappedValue(detail.source, 'origin', unfilled);
  const genres = joinMappedList(detail.genres, 'genres', unfilled);
  const studios = joinMappedList(detail.studios, 'studios', unfilled);

  return {
    name: detail.title,
    kind,
    totalEpisodes,
    duration,
    origin,
    genres,
    studios,
    coverURL: detail.coverURL,
    unfilled,
  };
}
