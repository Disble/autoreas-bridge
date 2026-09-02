import type { AnimeEditorScheduleBoard } from '../../../contracts/anime.types';
import { nextInstanceKey } from '../../ordering.helpers';
import { ANIME_SCHEDULE_DRAFT_ID_PREFIX, ANIME_SCHEDULE_STAGING_CONTAINER_ID } from './anime-schedule-ordering.constants';
import type {
  AnimeScheduleOrderingDraftEntry,
  AnimeScheduleOrderingInstance,
  AnimeScheduleOrderingProps,
  AnimeScheduleOrderingState,
} from './anime-schedule-ordering.types';

/**
 * Seeds one empty ordered bucket per board destination, so every destination
 * exists as a drop target even before a card lands on it.
 * @param board The authoritative schedule board.
 * @returns A per-destination order map with empty lists.
 */
function createEmptyOrder(board: AnimeEditorScheduleBoard) {
  const order: Record<string, string[]> = {};
  for (const destination of board.destinations) {
    order[destination.id] = [];
  }
  return order;
}

/**
 * Builds the editable schedule state from the authoritative schedule board so both
 * the editor modal and the Season adapter can share one ordering model.
 */
export function createAnimeScheduleOrderingState(board: AnimeEditorScheduleBoard): AnimeScheduleOrderingState {
  const order = createEmptyOrder(board);
  const instances: Record<string, AnimeScheduleOrderingInstance> = {};
  const defaultDestinationId = board.destinations.find((destination) => destination.kind === 'special')?.id ?? board.destinations[0]?.id ?? 'Sin ver';

  for (const entry of board.entries) {
    const placements = entry.placements.length > 0
      ? entry.placements.toSorted((left, right) => left.order - right.order)
      : [{ day: defaultDestinationId, order: 1 }];

    for (const placement of placements) {
      const key = nextInstanceKey(instances, entry.animeId);
      instances[key] = {
        key,
        animeId: entry.animeId,
        name: entry.name,
        baseModifiedAt: entry.modifiedAt,
        originHighlighted: entry.originHighlighted,
        initialOrder: placement.order,
      };
      order[placement.day] = [...(order[placement.day] ?? []), key];
    }
  }

  for (const keys of Object.values(order)) {
    keys.sort((left, right) => (instances[left].initialOrder ?? 0) - (instances[right].initialOrder ?? 0));
  }

  return { order, instances };
}

/**
 * Adds the client-only staging (wildcard) destination to a freshly built draft
 * state. Cards parked there are excluded from validation and the apply payload:
 * a staged move is discarded unless the card lands on a real destination.
 */
export function withStagingDestination(state: AnimeScheduleOrderingState): AnimeScheduleOrderingState {
  return {
    order: { ...state.order, [ANIME_SCHEDULE_STAGING_CONTAINER_ID]: [] },
    instances: state.instances,
    duplicateAllowedDestinations: [...(state.duplicateAllowedDestinations ?? []), ANIME_SCHEDULE_STAGING_CONTAINER_ID],
  };
}

/**
 * Resolves the distinct anime ids that currently have a card parked in the
 * staging area, so change counting and apply can honor the discard semantics.
 */
export function getStagedAnimeIds(state: AnimeScheduleOrderingState): ReadonlySet<string> {
  return new Set((state.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID] ?? []).map((key) => state.instances[key].animeId));
}

/**
 * Formats the discard warning shown while the staging area holds animes,
 * singularizing the wording for a count of exactly one.
 */
export function formatStagingWarning(count: number): string {
  return count === 1
    ? '1 anime is parked in the staging area. Apply ignores it — place it on a destination or its staged move will be lost.'
    : `${count} animes are parked in the staging area. Apply ignores them — place them on a destination or their staged moves will be lost.`;
}

/**
 * Builds the initial (or reset) draft state for the hook: authoritative board
 * state plus staging, then additive create-mode draft seeding and locked-id
 * marking. A no-op beyond `withStagingDestination` for edit-mode callers that
 * pass neither `draftEntries` nor `lockedAnimeIds`.
 */
export function buildInitialAnimeScheduleOrderingState(props: Readonly<AnimeScheduleOrderingProps>): AnimeScheduleOrderingState {
  let state = withStagingDestination(createAnimeScheduleOrderingState(props.board));
  state = seedDraftEntries(state, props.draftEntries);
  state = applyLockedAnimeIds(state, props.lockedAnimeIds);
  return state;
}

/**
 * Seeds one synthetic draft card per create-mode row into the staging area so
 * a batch of new animes can be dragged onto the shared board before they have
 * a real anime id. A no-op for edit-mode callers that pass no draft entries.
 */
export function seedDraftEntries(
  state: AnimeScheduleOrderingState,
  draftEntries: readonly AnimeScheduleOrderingDraftEntry[] | undefined,
): AnimeScheduleOrderingState {
  if (draftEntries === undefined || draftEntries.length === 0) {
    return state;
  }

  const stagingId = state.duplicateAllowedDestinations?.[0] ?? ANIME_SCHEDULE_STAGING_CONTAINER_ID;
  const instances = { ...state.instances };
  const stagedKeys = [...(state.order[stagingId] ?? [])];

  for (const draft of draftEntries) {
    const key = nextInstanceKey(instances, draft.draftId);
    instances[key] = {
      key,
      animeId: draft.draftId,
      name: draft.name,
      baseModifiedAt: 0,
      originHighlighted: false,
    };
    stagedKeys.push(key);
  }

  return {
    order: { ...state.order, [stagingId]: stagedKeys },
    instances,
    duplicateAllowedDestinations: state.duplicateAllowedDestinations,
  };
}

/**
 * Reconciles the draft's synthetic `__draft__:` cards against the latest
 * create-mode `draftEntries` prop: removes cards for drafts no longer
 * present, renames cards whose row name changed, and seeds newly added rows
 * -- all without disturbing an already-placed draft's position. Returns the
 * same state reference when nothing changed, so callers can safely re-run
 * this on every render without looping.
 */
export function reconcileDraftEntries(
  state: AnimeScheduleOrderingState,
  draftEntries: readonly AnimeScheduleOrderingDraftEntry[] | undefined,
): AnimeScheduleOrderingState {
  if (draftEntries === undefined || draftEntries.length === 0) {
    return state;
  }

  const nextIds = new Set(draftEntries.map((entry) => entry.draftId));
  const nameByDraftId = new Map(draftEntries.map((entry) => [entry.draftId, entry.name]));
  const presentDraftIds = collectDraftIds(state);
  const removedIds = [...presentDraftIds].filter((id) => !nextIds.has(id));
  const missingEntries = draftEntries.filter((entry) => !presentDraftIds.has(entry.draftId));

  const withoutRemoved = removeDraftCards(state, new Set(removedIds));
  const renamed = renameDraftCards(withoutRemoved.instances, nameByDraftId);

  if (removedIds.length === 0 && !renamed.changed && missingEntries.length === 0) {
    return state;
  }

  const reconciled = {
    order: withoutRemoved.order,
    instances: renamed.instances,
    duplicateAllowedDestinations: state.duplicateAllowedDestinations,
  };
  return missingEntries.length === 0 ? reconciled : seedDraftEntries(reconciled, missingEntries);
}

/**
 * Collects the anime ids of every synthetic create-mode card currently on the
 * board.
 * @param state The current draft.
 * @returns The distinct `__draft__:` ids present.
 */
function collectDraftIds(state: AnimeScheduleOrderingState): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const instance of Object.values(state.instances)) {
    if (instance.animeId.startsWith(ANIME_SCHEDULE_DRAFT_ID_PREFIX)) {
      ids.add(instance.animeId);
    }
  }
  return ids;
}

/**
 * Drops every card belonging to the given draft ids, from both the order and
 * the instance lookup.
 * @param state The current draft.
 * @param removeIds Draft ids whose cards must go.
 * @returns The order and instances with those cards gone.
 */
function removeDraftCards(state: AnimeScheduleOrderingState, removeIds: ReadonlySet<string>) {
  if (removeIds.size === 0) {
    return { order: state.order, instances: state.instances };
  }

  const instances = { ...state.instances };
  const order: Record<string, readonly string[]> = {};
  for (const [destinationId, keys] of Object.entries(state.order)) {
    order[destinationId] = keys.filter((key) => {
      if (Object.hasOwn(instances, key) && removeIds.has(instances[key].animeId)) {
        delete instances[key];
        return false;
      }
      return true;
    });
  }
  return { order, instances };
}

/**
 * Applies the latest row names to their draft cards, reporting whether anything
 * actually changed so the caller can return the original state untouched.
 * @param instances The instance lookup to rename within.
 * @param nameByDraftId Latest name per draft id.
 * @returns The instances and whether any name differed.
 */
function renameDraftCards(
  instances: Record<string, AnimeScheduleOrderingInstance>,
  nameByDraftId: ReadonlyMap<string, string>,
) {
  let changed = false;
  const renamed: Record<string, AnimeScheduleOrderingInstance> = {};
  for (const [key, instance] of Object.entries(instances)) {
    const nextName = nameByDraftId.get(instance.animeId);
    if (nextName !== undefined && nextName !== instance.name) {
      renamed[key] = { ...instance, name: nextName };
      changed = true;
    } else {
      renamed[key] = instance;
    }
  }
  return { instances: renamed, changed };
}

/**
 * Marks existing-neighbor cards drag-disabled for a create-mode caller while
 * leaving every other instance untouched. A no-op when no ids are supplied,
 * so edit-mode callers keep their exact prior behavior.
 */
export function applyLockedAnimeIds(
  state: AnimeScheduleOrderingState,
  lockedAnimeIds: readonly string[] | undefined,
): AnimeScheduleOrderingState {
  if (lockedAnimeIds === undefined || lockedAnimeIds.length === 0) {
    return state;
  }

  const locked = new Set(lockedAnimeIds);
  const instances: Record<string, AnimeScheduleOrderingInstance> = {};
  for (const [key, instance] of Object.entries(state.instances)) {
    instances[key] = locked.has(instance.animeId) ? { ...instance, locked: true } : instance;
  }

  return { order: state.order, instances, duplicateAllowedDestinations: state.duplicateAllowedDestinations };
}

