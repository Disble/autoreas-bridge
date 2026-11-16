import type { DragOverEvent } from '@dnd-kit/react';
import type { OrderingBoard, OrderingCard, SeasonAnimeRow, SeasonOrderingSnapshot, SeasonSource } from '../../../../shared/contracts/season.types';
import type { AnimeEditorScheduleBoard } from '../../../../shared/contracts/anime.types';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';
import {
  applyOrdering,
  duplicateOrderingCard,
  getInstancesIn,
  removeOrderingCard,
  shouldBlockDuplicateHover,
} from '../../../../shared/ordering/ordering.helpers';
import {
  createAnimeScheduleOrderingState,
} from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.helpers';
import { ORDERING_HISTORY_LOAD_ERROR, ORDERING_LAST_CARD_TOOLTIP, RAIL_CONTAINER_ID, WEEKDAYS } from './ordering-board.constants';
import type { DraftPlacement, OrderingBoardHistory, OrderingCardMeta, OrderingInstance, WorkingState } from './ordering-board.types';
import { buildAnimeScheduleDraftPlacements, validateAnimeScheduleDraft } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-payload.helpers';

/**
 * Groups every board card by anime, so an anime placed on several weekdays is
 * rebuilt as one entry with several placements.
 * @param board The Season ordering board.
 * @returns One card list per distinct anime.
 */
function cardsByAnime(board: OrderingBoard) {
  const cards = [...board.rail, ...board.grid];
  return [...new Set(cards.map((card) => card.animeId))].map((animeId) => cards.filter((card) => card.animeId === animeId));
}

/**
 * Adapts the Season board into the shared schedule board shape, so Season can
 * reuse the schedule core instead of keeping a parallel state machine. The rail
 * becomes a wildcard destination and the weekdays become exclusive ones.
 * @param board The Season ordering board.
 * @returns The equivalent shared schedule board.
 */
function toSharedBoard(board: OrderingBoard): AnimeEditorScheduleBoard {
  return {
    originAnimeId: '', boardModifiedAt: 0,
    destinations: [
      { id: RAIL_CONTAINER_ID, label: 'Approved to place', kind: 'special' },
      ...WEEKDAYS.map((day) => ({ id: day, label: day, kind: 'weekday' as const })),
    ],
    entries: cardsByAnime(board).map((cards) => ({
      animeId: cards[0].animeId,
      name: cards[0].name,
      active: true,
      modifiedAt: 0,
      placements: cards.map((card) => ({ day: card.dia || RAIL_CONTAINER_ID, order: card.orden })),
      status: 0,
      progress: 0,
      originHighlighted: false,
    })),
  };
}

/**
 * Finds the original card behind an instance, preferring the one already in the
 * given container and falling back to any card for that anime.
 * @param board The Season ordering board.
 * @param animeId The anime being placed.
 * @param containerId The container the instance currently sits in.
 * @returns The matching source card.
 */
function sourceCardFor(board: OrderingBoard, animeId: string, containerId: string): OrderingCard {
  const cards = [...board.rail, ...board.grid];
  return cards.find((card) => card.animeId === animeId && (card.dia || RAIL_CONTAINER_ID) === containerId)
    ?? cards.find((card) => card.animeId === animeId)!;
}

/**
 * Renders placements as one order-insensitive string, so two drafts can be
 * compared for equality without caring which order the placements arrived in.
 * @param placements The placements to fingerprint.
 * @returns A stable comparison key.
 */
function placementKey(placements: readonly DraftPlacement[]) {
  return placements.map((placement) => `${placement.dia}#${placement.orden}`).toSorted((left, right) => left.localeCompare(right)).join('|');
}

/**
 * Decodes a saved draft, reading anything that is not an `{animeId: placements[]}`
 * object as no draft, so a corrupt payload shows the applied schedule.
 * @param raw The saved draft JSON.
 * @returns The placements per anime id.
 */
function parseOrderingDraft(raw: string | undefined): Record<string, readonly DraftPlacement[]> {
  try {
    // Stryker disable next-line StringLiteral: any fallback that is not JSON throws into the same catch as a missing draft.
    const parsed = JSON.parse(raw ?? '') as object;
    // `null` throws inside Object.entries and lands in the catch; entries that are not
    // placement lists are dropped so they keep their applied cards.
    return Object.fromEntries(Object.entries(parsed).filter(([, placements]) => Array.isArray(placements))) as Record<string, readonly DraftPlacement[]>;
  } catch {
    return {};
  }
}

/**
 * Places each drafted card where its saved draft put it, so reopening an unapplied
 * board restores the edits. Weekday placements become grid cards, any other one a
 * rail card in that Estrenos section; an anime absent from the draft keeps its
 * applied cards, and a drafted anime no longer on the board is ignored. An applied
 * board shows the applied schedule only.
 * @param board The applied board plus its saved draft.
 * @returns The board to edit.
 */
function applyOrderingDraft(board: OrderingBoard): OrderingBoard {
  if (typeof board.appliedAt === 'number') return board;
  const draft = parseOrderingDraft(board.draft);
  const cards: OrderingCard[] = [];
  const placed = new Set<string>();
  for (const card of [...board.rail, ...board.grid]) {
    const placements = draft[card.animeId];
    if (placements === undefined) {
      cards.push(card);
    } else if (!placed.has(card.animeId)) {
      placed.add(card.animeId);
      cards.push(...draftedCards(card, placements));
    }
  }
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral,MethodExpression: equivalent — the only consumer, initialWorkingState, re-merges rail and grid and routes each card by its `dia`.
  return { ...board, rail: cards.filter((card) => card.dia === ''), grid: cards.filter((card) => card.dia !== '') };
}

/**
 * Builds one card per drafted placement: a weekday card, or a rail card in that
 * Estrenos section. A card moved onto a weekday keeps its section, as it does
 * mid-session, so dragging it back to the rail restores that section.
 * @param card Any of the anime's applied cards, the source of its name and flags.
 * @param placements The anime's drafted placements.
 * @returns The anime's cards, rail cards carrying an empty `dia`.
 */
function draftedCards(card: OrderingCard, placements: readonly DraftPlacement[]): OrderingCard[] {
  return placements.map(({ dia, orden }) => ((WEEKDAYS as readonly string[]).includes(dia)
    ? { ...card, dia, orden }
    : { ...card, dia: '', orden, section: dia }));
}

/**
 * Reads the live ordering board through the source's query read. A source that
 * cannot read it rejects, so the board reports a failure, never an empty schedule.
 * @param source The season port slice the live board is read through.
 * @returns The live board with its saved draft.
 */
export function fetchLiveOrderingBoard(source: Pick<SeasonSource, 'fetchOrderingBoard'>): Promise<OrderingBoard> {
  return source.fetchOrderingBoard?.() ?? Promise.reject(new Error('the season source cannot read the ordering board'));
}

/**
 * The board a closure snapshot stored, shown read-only for its past season.
 * @param snapshot The past season's closure snapshot.
 * @returns The stored board.
 */
export function toStoredOrderingBoard(snapshot: SeasonOrderingSnapshot): OrderingBoard {
  return { rail: snapshot.rail, grid: snapshot.grid, appliedAt: snapshot.appliedAt };
}

/**
 * Where the stored-board read of the viewed past season stands. The live board
 * is recorded and never loading. A source that cannot read the snapshot, or a
 * failed read, is a failure and never a season that recorded nothing; a read in
 * flight is loading.
 * @param viewSeasonId The past season being viewed, or null for the live board.
 * @param canRead Whether the source can read the closure snapshot at all.
 * @param snapshot The viewed season's snapshot read.
 * @returns The loading flag, the recorded flag and the failure message.
 */
export function toOrderingBoardHistory(
  viewSeasonId: string | null,
  canRead: boolean,
  snapshot: AsyncView<SeasonOrderingSnapshot>,
): OrderingBoardHistory {
  if (viewSeasonId === null) {
    return { isHistoricalLoading: false, historicalRecorded: true, historicalError: undefined };
  }
  if (!canRead) {
    return { isHistoricalLoading: false, historicalRecorded: false, historicalError: ORDERING_HISTORY_LOAD_ERROR };
  }
  if (snapshot.kind === 'failure') {
    return { isHistoricalLoading: false, historicalRecorded: false, historicalError: snapshot.message };
  }
  if (snapshot.kind === 'ready') {
    return { isHistoricalLoading: false, historicalRecorded: snapshot.data.recorded, historicalError: undefined };
  }
  return { isHistoricalLoading: true, historicalRecorded: false, historicalError: undefined };
}

/**
 * The working state a loaded board starts from: the live board with its saved
 * draft restored, or a past season's stored board as it was recorded.
 * @param viewSeasonId The past season being viewed, or null for the live board.
 * @param loaded The loaded board.
 * @returns The editable working state.
 */
export function toLoadedWorkingState(viewSeasonId: string | null, loaded: OrderingBoard): WorkingState {
  return initialWorkingState(viewSeasonId === null ? applyOrderingDraft(loaded) : loaded);
}

/**
 * The failure message of the live board read, reported only while the live
 * board is the one shown.
 * @param viewSeasonId The past season being viewed, or null for the live board.
 * @param live The live board read.
 * @returns The failure message, or undefined.
 */
export function toLiveOrderingError(viewSeasonId: string | null, live: AsyncView<OrderingBoard>): string | undefined {
  return viewSeasonId === null && live.kind === 'failure' ? live.message : undefined;
}

/**
 * Whether the board is locked: an applied schedule, or a past season viewed from history.
 * @param board The loaded board.
 * @param isPastSeason Whether a past season is being viewed.
 * @returns True when cards cannot be edited.
 */
export function isOrderingBoardReadOnly(board: OrderingBoard, isPastSeason: boolean): boolean {
  return typeof board.appliedAt === 'number' || isPastSeason;
}

/**
 * The board's error message: the season store's last failure, else the live
 * board read failure, so a failed read keeps the rail's empty state off the screen.
 * @param storeError The season store's last failure message.
 * @param liveError The live board read failure message.
 * @returns The message to show, or undefined.
 */
export function toOrderingBoardErrorMessage(storeError: string | undefined, liveError: string | undefined): string | undefined {
  return storeError ?? liveError;
}

/** Builds the Season adapter state through the reusable schedule-specific core. */
export function initialWorkingState(board: OrderingBoard): WorkingState {
  const shared = createAnimeScheduleOrderingState(toSharedBoard(board));
  const instances: Record<string, OrderingInstance> = {};
  for (const [key, instance] of Object.entries(shared.instances)) {
    const containerId = Object.entries(shared.order).find(([, keys]) => keys.includes(key))?.[0] ?? RAIL_CONTAINER_ID;
    const card = sourceCardFor(board, instance.animeId, containerId);
    instances[key] = { ...instance, isPendingDuplicate: false, section: card.section, orden: card.orden, isNewcomer: card.isNewcomer };
  }
  return { order: shared.order, instances, duplicateAllowedDestinations: [RAIL_CONTAINER_ID] };
}

/**
 * Joins the season selection rows into a per-anime lookup of grade and
 * desktop-action affordances, keyed by `animeId`. Ordering cards carry only an
 * `animeId`, so the board reads grade/page/folder from this map rather than the
 * ordering read model. Rows without an `animeId` (uncreated candidates) are
 * skipped.
 */
export function buildOrderingCardMeta(rows: readonly SeasonAnimeRow[]): Record<string, OrderingCardMeta> {
  const meta: Record<string, OrderingCardMeta> = {};
  for (const row of rows) {
    if (row.animeId === '') {
      continue;
    }
    const pageUrl = row.pageUrl ?? '';
    const folderPath = row.folderPath ?? '';
    meta[row.animeId] = {
      grade: row.grade,
      pageUrl,
      folderPath,
      hasPage: pageUrl !== '',
      hasFolder: folderPath !== '',
    };
  }
  return meta;
}

/**
 * Lists every anime on the loaded board once, rail first then grid, so each
 * card's cover is resolved a single time however many clones it has.
 * @param board The Season ordering board.
 * @returns The distinct anime ids, in board order.
 */
export function orderingAnimeIds(board: OrderingBoard): string[] {
  return [...new Set([...board.rail, ...board.grid].map((card) => card.animeId))];
}

/** Resolves one Season destination through the shared ordered collection. */
export function instancesIn(state: WorkingState, container: string): OrderingInstance[] {
  return getInstancesIn(state, container);
}

/** Counts card instances per anime for minimum-one controls. */
export function cardCounts(state: WorkingState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const instance of Object.values(state.instances)) counts[instance.animeId] = (counts[instance.animeId] ?? 0) + 1;
  return counts;
}

/** Counts distinct anime assigned to weekdays. */
export function scheduledCount(state: WorkingState): number {
  const ids = new Set<string>();
  for (const day of WEEKDAYS) for (const instance of instancesIn(state, day)) ids.add(instance.animeId);
  return ids.size;
}

/** Validates the Season weekday invariant while allowing duplicate staging cards. */
export function hasDuplicateWeekdayPlacements(state: WorkingState): boolean {
  return validateAnimeScheduleDraft(state) !== undefined;
}

/** Blocks same-anime weekday hover through the reusable schedule core. */
export function shouldCancelForbiddenWeekdayHover(state: WorkingState, event: DragOverEvent): boolean {
  return shouldBlockDuplicateHover(state, event);
}

/** Applies projected DnD order through the reusable schedule core. */
export function applyOrder(state: WorkingState, order: Record<string, readonly string[]>): WorkingState {
  return applyOrdering(state, order);
}

/** Stages a Season clone in the approved rail through the reusable schedule core. */
export function duplicate(state: WorkingState, animeId: string): WorkingState {
  const next = duplicateOrderingCard(state, animeId);
  if (next === state) return state;
  const key = Object.keys(next.instances).find((candidate) => state.instances[candidate] === undefined)!;
  return {
    order: next.order,
    duplicateAllowedDestinations: [RAIL_CONTAINER_ID],
    instances: { ...next.instances, [key]: { ...next.instances[key], isPendingDuplicate: true, section: '', orden: 0 } },
  };
}

/** Removes a Season clone while retaining one card through the reusable core. */
export function removeCard(state: WorkingState, key: string): WorkingState {
  return removeOrderingCard(state, key);
}

/** Serializes shared ordered collections into the existing Season persistence DTO. */
export function buildDraft(state: WorkingState): Record<string, DraftPlacement[]> {
  const placements = buildAnimeScheduleDraftPlacements(state);
  const draft: Record<string, DraftPlacement[]> = {};
  for (const [animeId, values] of Object.entries(placements)) {
    const weekdays = values.filter((placement) => placement.day !== RAIL_CONTAINER_ID);
    if (weekdays.length > 0) draft[animeId] = weekdays.map((placement) => ({ dia: placement.day, orden: placement.order }));
  }
  for (const instance of instancesIn(state, RAIL_CONTAINER_ID)) {
    if (!instance.isPendingDuplicate && draft[instance.animeId] === undefined && instance.section !== '') {
      draft[instance.animeId] = [{ dia: instance.section, orden: instance.orden }];
    }
  }
  return draft;
}

/** Renders the Season draft as the JSON persisted by its adapter. */
export function serializeDraft(state: WorkingState): string {
  return JSON.stringify(buildDraft(state));
}

/** Counts anime whose normalized placements differ from loaded Season authority. */
export function countChanges(board: OrderingBoard, state: WorkingState): number {
  const before = buildDraft(initialWorkingState(board));
  const after = buildDraft(state);
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...ids].filter((animeId) => placementKey(before[animeId] ?? []) !== placementKey(after[animeId] ?? [])).length;
}

/**
 * Why a card's Remove button is locked: the card is its anime's last one. The
 * tooltip appends it after the action name while the button is disabled.
 *
 * @param canRemove Whether the anime holds more than one card.
 * @returns The lock reason, or `undefined` when the card can be removed.
 */
export function getRemoveDisabledReason(canRemove: boolean): string | undefined {
  return canRemove ? undefined : ORDERING_LAST_CARD_TOOLTIP;
}
