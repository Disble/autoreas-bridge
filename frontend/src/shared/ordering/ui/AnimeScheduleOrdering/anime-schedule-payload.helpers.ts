import type { ApplyAnimeScheduleDraftEntry, AnimeEditorScheduleBoard } from '../../../contracts/anime.types';
import { ANIME_SCHEDULE_DRAFT_ID_PREFIX, ANIME_SCHEDULE_ORDERING_DUPLICATE_ERROR, ANIME_SCHEDULE_STAGING_CONTAINER_ID } from './anime-schedule-ordering.constants';
import { createAnimeScheduleOrderingState, getStagedAnimeIds } from './anime-schedule-ordering.helpers';
import type {
  AnimeScheduleDraftPlacement,
  AnimeScheduleOrderingCreateSubmit,
  AnimeScheduleOrderingState,
} from './anime-schedule-ordering.types';

// The projection half of the schedule draft: turning the working state into
// placements, diffing it against board authority, and serializing the apply
// payload. Split out of anime-schedule-ordering.helpers.ts on 2026-08-13, which
// held both this and the draft lifecycle and had grown past the 500-line
// ceiling. The two never shared state — only the state *type* — so the seam was
// already there.

/**
 * Indexes destinations by their board position, so placements can be compared
 * in the order the board presents them rather than alphabetically.
 * @param board The authoritative schedule board.
 * @returns A destination id to rank lookup.
 */
function createDestinationRank(board: AnimeEditorScheduleBoard) {
  return new Map(board.destinations.map((destination, index) => [destination.id, index]));
}

/**
 * Rebuilds the authoritative state minus the currently staged card keys. A
 * parked card is treated as still holding its original slot, so parking alone
 * never ripples its former column mates into the diff; the ripple appears once
 * the card lands on a real destination or is removed.
 * @param board The authoritative schedule board.
 * @param state The current draft.
 * @returns The authoritative state with staged keys withheld.
 */
function originalStateIgnoringStaged(board: AnimeEditorScheduleBoard, state: AnimeScheduleOrderingState): AnimeScheduleOrderingState {
  const original = createAnimeScheduleOrderingState(board);
  const stagedKeys = new Set(state.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID] ?? []);
  if (stagedKeys.size === 0) {
    return original;
  }
  const order: Record<string, readonly string[]> = {};
  for (const [destinationId, keys] of Object.entries(original.order)) {
    order[destinationId] = keys.filter((key) => !stagedKeys.has(key));
  }
  return { order, instances: original.instances };
}

/**
 * Orders two destination ids by board rank, falling back to locale compare so
 * an unknown destination still sorts deterministically.
 * @param destinationRank Destination id to rank lookup.
 * @param leftDay First destination id.
 * @param rightDay Second destination id.
 * @returns Negative, zero or positive in comparator convention.
 */
function compareDestinationIds(destinationRank: ReadonlyMap<string, number>, leftDay: string, rightDay: string) {
  const leftRank = destinationRank.get(leftDay) ?? Number.MAX_SAFE_INTEGER;
  const rightRank = destinationRank.get(rightDay) ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return leftDay.localeCompare(rightDay);
}

/**
 * Orders two placements by destination rank first, then by position within it.
 * @param destinationRank Destination id to rank lookup.
 * @param left First placement.
 * @param right Second placement.
 * @returns Negative, zero or positive in comparator convention.
 */
function comparePlacements(
  destinationRank: ReadonlyMap<string, number>,
  left: Readonly<AnimeScheduleDraftPlacement>,
  right: Readonly<AnimeScheduleDraftPlacement>,
) {
  const destinationComparison = compareDestinationIds(destinationRank, left.day, right.day);
  if (destinationComparison !== 0) {
    return destinationComparison;
  }

  return left.order - right.order;
}

/**
 * Builds the per-anime placement map that the editor apply command serializes.
 */
export function buildAnimeScheduleDraftPlacements(state: AnimeScheduleOrderingState) {
  const draft: Record<string, AnimeScheduleDraftPlacement[]> = {};
  const duplicateAllowed = new Set(state.duplicateAllowedDestinations);

  for (const [destinationId, keys] of Object.entries(state.order)) {
    if (duplicateAllowed.has(destinationId)) continue;
    keys.forEach((key, index) => {
      const instance = state.instances[key];
      draft[instance.animeId] = [...(draft[instance.animeId] ?? []), { day: destinationId, order: index + 1 }];
    });
  }

  return draft;
}

/**
 * Canonicalizes one anime placements for comparison. Placement order is global
 * to its destination, so this only sorts: reindexing would erase an in-column
 * move such as Visto#4 to Visto#1.
 * @param destinationRank Destination id to rank lookup.
 * @param placements The placements to normalize.
 * @returns The placements in canonical order.
 */
function normalizePlacements(destinationRank: ReadonlyMap<string, number>, placements: readonly AnimeScheduleDraftPlacement[]) {
  // Placement order is global to its destination. Reindexing this one anime's
  // placements would erase an in-column move such as Visto#4 -> Visto#1.
  return sortPlacements(destinationRank, placements);
}

/**
 * Sorts placements into board order.
 * @param destinationRank Destination id to rank lookup.
 * @param placements The placements to sort.
 * @returns A new sorted array.
 */
function sortPlacements(destinationRank: ReadonlyMap<string, number>, placements: readonly AnimeScheduleDraftPlacement[]) {
  return placements.toSorted((left, right) => comparePlacements(destinationRank, left, right));
}

/**
 * Orders apply entries by their first placement so the payload reads in board
 * order; entries without placements sort last, then by anime id.
 * @param destinationRank Destination id to rank lookup.
 * @param left First entry.
 * @param right Second entry.
 * @returns Negative, zero or positive in comparator convention.
 */
function compareApplyEntries(
  destinationRank: ReadonlyMap<string, number>,
  left: Readonly<ApplyAnimeScheduleDraftEntry>,
  right: Readonly<ApplyAnimeScheduleDraftEntry>,
) {
  // Every entry that reaches here has at least one placement. An anime with
  // none is either parked in staging — skipped by the `continue` above — or
  // impossible, because `removeOrderingCard` refuses to drop an anime's last
  // card. The earlier version carried two extra branches ordering entries with
  // no placements; mutation testing on 2026-08-13 showed 12 mutants sitting in
  // them permanently uncovered, and tracing the callers confirmed no sequence
  // can reach them. The `undefined` check stays as a cheap guard so a future
  // caller gets a deterministic order instead of a crash.
  const leftPlacement = left.placements.at(0);
  const rightPlacement = right.placements.at(0);

  if (leftPlacement === undefined || rightPlacement === undefined) {
    return left.animeId.localeCompare(right.animeId);
  }

  const placementComparison = comparePlacements(destinationRank, leftPlacement, rightPlacement);
  return placementComparison !== 0 ? placementComparison : left.animeId.localeCompare(right.animeId);
}

/**
 * Counts how many anime differ between the authoritative board snapshot and the current
 * draft so the footer can show meaningful dirty feedback.
 */
export function countAnimeScheduleChanges(board: AnimeEditorScheduleBoard, state: AnimeScheduleOrderingState) {
  const destinationRank = createDestinationRank(board);
  const before = buildAnimeScheduleDraftPlacements(originalStateIgnoringStaged(board, state));
  const after = buildAnimeScheduleDraftPlacements(state);
  const staged = getStagedAnimeIds(state);
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  let changes = 0;

  for (const animeId of ids) {
    if ((after[animeId] ?? []).length === 0 && staged.has(animeId)) {
      continue;
    }
    const normalizedBefore = JSON.stringify(normalizePlacements(destinationRank, before[animeId] ?? []));
    const normalizedAfter = JSON.stringify(normalizePlacements(destinationRank, after[animeId] ?? []));
    if (normalizedBefore !== normalizedAfter) {
      changes += 1;
    }
  }

  return changes;
}

/**
 * Validates the draft before apply and returns a user-facing message when a destination
 * duplicates one anime or the ordering cannot be normalized cleanly.
 */
export function validateAnimeScheduleDraft(state: AnimeScheduleOrderingState) {
  const duplicateAllowed = new Set(state.duplicateAllowedDestinations);
  for (const [destinationId, keys] of Object.entries(state.order)) {
    if (duplicateAllowed.has(destinationId)) continue;
    const seen = new Set<string>();
    for (const key of keys) {
      const animeId = state.instances[key].animeId;
      if (seen.has(animeId)) {
        return `${ANIME_SCHEDULE_ORDERING_DUPLICATE_ERROR} (${destinationId})`;
      }
      seen.add(animeId);
    }
  }
  return undefined;
}

/**
 * Converts the dirty draft into the changed-record-only Wails payload the backend expects.
 */
export function createAnimeScheduleApplyEntries(board: AnimeEditorScheduleBoard, state: AnimeScheduleOrderingState): readonly ApplyAnimeScheduleDraftEntry[] {
  const destinationRank = createDestinationRank(board);
  const original = buildAnimeScheduleDraftPlacements(originalStateIgnoringStaged(board, state));
  const current = buildAnimeScheduleDraftPlacements(state);
  const staged = getStagedAnimeIds(state);
  const changed: ApplyAnimeScheduleDraftEntry[] = [];

  for (const entry of board.entries) {
    const before = JSON.stringify(normalizePlacements(destinationRank, original[entry.animeId] ?? []));
    const currentPlacements = current[entry.animeId] ?? [];
    // A fully staged anime reverts to its authoritative placements: the staged
    // move is discarded rather than serialized as an empty-placement removal.
    //
    // Belt and braces, deliberately. `originalStateIgnoringStaged` already
    // withholds the staged keys, so `before` is empty whenever this fires and
    // the `before === after` check below would skip the entry anyway. Mutation
    // testing on 2026-08-13 showed the mutants here cannot be killed for that
    // reason. It stays because it states the discard rule where the rule is
    // read, instead of leaving it to a coincidence two functions apart.
    if (currentPlacements.length === 0 && staged.has(entry.animeId)) {
      continue;
    }
    const after = JSON.stringify(normalizePlacements(destinationRank, currentPlacements));
    if (before === after) {
      continue;
    }
    changed.push({
      animeId: entry.animeId,
      baseModifiedAt: entry.modifiedAt,
      placements: sortPlacements(destinationRank, currentPlacements),
    });
  }

  return changed.toSorted((left, right) => compareApplyEntries(destinationRank, left, right));
}

/**
 * Splits the current draft's placement map into new-anime creates (identified
 * by the `__draft__:` synthetic-id prefix) and changed-existing-neighbor
 * entries, reusing `createAnimeScheduleApplyEntries` for the latter so the
 * same reflow diffing stays the single source of truth.
 */
export function partitionCreateSubmit(board: AnimeEditorScheduleBoard, state: AnimeScheduleOrderingState): AnimeScheduleOrderingCreateSubmit {
  const draft = buildAnimeScheduleDraftPlacements(state);
  const creates: Record<string, AnimeScheduleDraftPlacement[]> = {};
  for (const [animeId, placements] of Object.entries(draft)) {
    if (animeId.startsWith(ANIME_SCHEDULE_DRAFT_ID_PREFIX)) {
      creates[animeId] = placements;
    }
  }

  // No draft filter here: `createAnimeScheduleApplyEntries` iterates
  // `board.entries`, and a synthetic `__draft__:` card is by definition not on
  // the board, so it can never appear among the entries. The filter that used to
  // sit here could not remove anything; mutation testing on 2026-08-13 surfaced
  // it as two mutants no test could ever kill.
  const changedNeighbors = createAnimeScheduleApplyEntries(board, state);

  return { creates, changedNeighbors };
}
