import { describe, expect, it } from 'vitest';
import { ANIME_SCHEDULE_STAGING_CONTAINER_ID } from '../anime-schedule-ordering.constants';
import {
  applyLockedAnimeIds,
  createAnimeScheduleOrderingState,
  formatStagingWarning,
  getStagedAnimeIds,
  reconcileDraftEntries,
  seedDraftEntries,
  withStagingDestination,
} from '../anime-schedule-ordering.helpers';
import { duplicateOrderingCard, moveOrderingCard } from '../../../ordering.helpers';
import { countAnimeScheduleChanges, createAnimeScheduleApplyEntries, partitionCreateSubmit, validateAnimeScheduleDraft } from '../anime-schedule-payload.helpers';
import type { AnimeScheduleOrderingState } from '../anime-schedule-ordering.types';

/** Baseline fixture board for the draft-state assertions. */
const board = {
  originAnimeId: 'anime-1',
  boardModifiedAt: 100,
  destinations: [
    { id: 'Lunes', label: 'Lunes', kind: 'weekday' },
    { id: 'Sin ver', label: 'Sin ver', kind: 'special' },
  ],
  entries: [
    { animeId: 'anime-1', name: 'Frieren', active: true, modifiedAt: 100, placements: [{ day: 'Lunes', order: 1 }], status: 0, progress: 1, originHighlighted: true },
  ],
} as const;

/** Board whose Sunday destination holds no entries, covering the empty-column paths. */
const sparseSundayBoard = {
  originAnimeId: 'bang-dream',
  boardModifiedAt: 300,
  destinations: [
    { id: 'Domingo', label: 'Domingo', kind: 'weekday' },
    { id: 'Sin ver', label: 'Sin ver', kind: 'special' },
    { id: 'Visto', label: 'Visto', kind: 'special' },
  ],
  entries: [
    { animeId: 'sayonara-lara', name: 'Sayonara Lara', active: true, modifiedAt: 101, placements: [{ day: 'Sin ver', order: 1 }], status: 0, progress: 0, originHighlighted: false },
    { animeId: 'yani-neko', name: 'Yani Neko', active: true, modifiedAt: 102, placements: [{ day: 'Sin ver', order: 2 }], status: 0, progress: 0, originHighlighted: false },
    { animeId: 'youjo-senki-ii', name: 'Youjo Senki II', active: true, modifiedAt: 103, placements: [{ day: 'Sin ver', order: 3 }], status: 0, progress: 0, originHighlighted: false },
    { animeId: 'bang-dream', name: 'BanG Dream! YumemoMita', active: true, modifiedAt: 104, placements: [{ day: 'Sin ver', order: 4 }], status: 0, progress: 0, originHighlighted: true },
    { animeId: 'futsutsuka', name: 'Futsutsuka...', active: true, modifiedAt: 105, placements: [{ day: 'Visto', order: 1 }], status: 1, progress: 12, originHighlighted: false },
    { animeId: 'iwamoto', name: 'Iwamoto...', active: true, modifiedAt: 106, placements: [{ day: 'Visto', order: 2 }], status: 1, progress: 12, originHighlighted: false },
    { animeId: 'tai-ari', name: 'Tai-Ari...', active: true, modifiedAt: 107, placements: [{ day: 'Visto', order: 3 }], status: 1, progress: 12, originHighlighted: false },
    { animeId: 'tenmaku', name: 'Tenmaku...', active: true, modifiedAt: 108, placements: [{ day: 'Visto', order: 4 }], status: 1, progress: 12, originHighlighted: false },
    { animeId: 'domingo-legacy', name: 'Sunday Legacy', active: true, modifiedAt: 109, placements: [{ day: 'Domingo', order: 2 }], status: 0, progress: 1, originHighlighted: false },
  ],
} as const;

/** Board with destinations deliberately out of alphabetical order, pinning board-rank sorting. */
const orderedDestinationsBoard = {
  originAnimeId: 'origin-anime',
  boardModifiedAt: 400,
  destinations: [
    { id: 'Lunes', label: 'Lunes', kind: 'weekday' },
    { id: 'Martes', label: 'Martes', kind: 'weekday' },
    { id: 'Miercoles', label: 'Miercoles', kind: 'weekday' },
    { id: 'Jueves', label: 'Jueves', kind: 'weekday' },
    { id: 'Viernes', label: 'Viernes', kind: 'weekday' },
    { id: 'Sabado', label: 'Sabado', kind: 'weekday' },
    { id: 'Domingo', label: 'Domingo', kind: 'weekday' },
    { id: 'Sin ver', label: 'Sin ver', kind: 'special' },
    { id: 'Ver hoy', label: 'Ver hoy', kind: 'special' },
    { id: 'Visto', label: 'Visto', kind: 'special' },
  ],
  entries: [
    { animeId: 'monday-anime', name: 'Monday Anime', active: true, modifiedAt: 201, placements: [{ day: 'Sin ver', order: 1 }], status: 0, progress: 0, originHighlighted: false },
    { animeId: 'special-anime', name: 'Special Anime', active: true, modifiedAt: 202, placements: [{ day: 'Sin ver', order: 2 }], status: 0, progress: 0, originHighlighted: false },
    { animeId: 'sunday-anime', name: 'Sunday Anime', active: true, modifiedAt: 203, placements: [{ day: 'Sin ver', order: 3 }], status: 0, progress: 0, originHighlighted: false },
  ],
} as const;

/**
 * Builds a board around a single entry, so the placement-seeding rules can be
 * exercised against boards the real editor never produces.
 * @param destinations The destinations the board declares.
 * @param placements The entry's placements; empty exercises the fallback.
 * @returns A one-entry board.
 */
function boardWith(
  destinations: readonly { id: string; label: string; kind: 'weekday' | 'special' }[],
  placements: readonly { day: string; order: number }[],
) {
  return {
    originAnimeId: 'x',
    boardModifiedAt: 1,
    destinations,
    entries: [{ animeId: 'x', name: 'X', active: true, modifiedAt: 1, placements, status: 0, progress: 0, originHighlighted: false }],
  } as unknown as Parameters<typeof createAnimeScheduleOrderingState>[0];
}

/**
 * Builds a weekday destination whose label matches its id.
 * @param id The destination id.
 * @returns A weekday destination.
 */
const weekday = (id: string) => ({ id, label: id, kind: 'weekday' as const });

/**
 * Builds a special destination whose label matches its id.
 * @param id The destination id.
 * @returns A special destination.
 */
const special = (id: string) => ({ id, label: id, kind: 'special' as const });

// An entry with no placements is the only way into the default-destination
// chain, and no test reached it: measured 2026-08-13, line 33 alone carried 9
// surviving mutants and the ternary below it another 4. The three boards here
// walk the chain's three rungs.
describe('createAnimeScheduleOrderingState', () => {
  it('places each entry\'s cards in placement order and parks an unplaced entry on the default chain', () => {
    const cases: ReadonlyArray<readonly [string, Parameters<typeof createAnimeScheduleOrderingState>[0], Record<string, readonly string[]>]> = [
      ['no placements: first special destination, not the first destination', boardWith([weekday('Lunes'), special('Sin ver'), special('Visto')], []), { 'Sin ver': ['x#0'], Lunes: [] }],
      ['no placements, no special destination: first destination', boardWith([weekday('Lunes'), weekday('Martes')], []), { Lunes: ['x#0'], Martes: [] }],
      ['no placements, no destination at all: a literal Sin ver bucket', boardWith([], []), { 'Sin ver': ['x#0'] }],
      ['the baseline board', board, { Lunes: ['anime-1#0'] }],
      [
        'keys minted in placement order, not arrival order',
        boardWith([weekday('Lunes'), weekday('Miercoles')], [{ day: 'Miercoles', order: 2 }, { day: 'Lunes', order: 1 }]),
        { Lunes: ['x#0'], Miercoles: ['x#1'] },
      ],
      ['undeclared destination materializes a bucket', boardWith([weekday('Lunes')], [{ day: 'Ghost Day', order: 1 }]), { 'Ghost Day': ['x#0'], Lunes: [] }],
    ];
    for (const [name, source, expected] of cases) {
      const { order } = createAnimeScheduleOrderingState(source);

      for (const [destination, keys] of Object.entries(expected)) {
        expect.soft(order[destination], `${name}: ${destination}`).toEqual(keys);
      }
    }
  });
});

describe('anime-schedule-ordering.helpers', () => {
  it('flags duplicate cards in one destination', () => {
    const invalid = duplicateOrderingCard(createAnimeScheduleOrderingState(board), 'anime-1');
    expect(validateAnimeScheduleDraft(invalid)).toContain('Each destination');
  });

  it('counts draft changes and emits changed-record-only apply entries', () => {
    const invalid = duplicateOrderingCard(createAnimeScheduleOrderingState(board), 'anime-1');
    expect(countAnimeScheduleChanges(board, invalid)).toBe(1);
    expect(createAnimeScheduleApplyEntries(board, invalid)).toHaveLength(1);
  });

  it('reports every reindexed queue card and preserves sparse Sunday membership', () => {
    let state = createAnimeScheduleOrderingState(sparseSundayBoard);
    state = moveOrderingCard(state, { animeId: 'bang-dream', destinationId: 'Visto', order: 1 });
    state = moveOrderingCard(state, { animeId: 'yani-neko', destinationId: 'Visto', order: 2 });
    state = moveOrderingCard(state, { animeId: 'sayonara-lara', destinationId: 'Visto', order: 3 });

    expect(countAnimeScheduleChanges(sparseSundayBoard, state)).toBe(8);

    const entries = createAnimeScheduleApplyEntries(sparseSundayBoard, state);

    expect(entries.map((entry) => entry.animeId)).toEqual(['youjo-senki-ii', 'bang-dream', 'yani-neko', 'sayonara-lara', 'futsutsuka', 'iwamoto', 'tai-ari', 'tenmaku']);
    expect(entries).toEqual([
      { animeId: 'youjo-senki-ii', baseModifiedAt: 103, placements: [{ day: 'Sin ver', order: 1 }] },
      { animeId: 'bang-dream', baseModifiedAt: 104, placements: [{ day: 'Visto', order: 1 }] },
      { animeId: 'yani-neko', baseModifiedAt: 102, placements: [{ day: 'Visto', order: 2 }] },
      { animeId: 'sayonara-lara', baseModifiedAt: 101, placements: [{ day: 'Visto', order: 3 }] },
      { animeId: 'futsutsuka', baseModifiedAt: 105, placements: [{ day: 'Visto', order: 4 }] },
      { animeId: 'iwamoto', baseModifiedAt: 106, placements: [{ day: 'Visto', order: 5 }] },
      { animeId: 'tai-ari', baseModifiedAt: 107, placements: [{ day: 'Visto', order: 6 }] },
      { animeId: 'tenmaku', baseModifiedAt: 108, placements: [{ day: 'Visto', order: 7 }] },
    ]);
    expect(entries.some((entry) => entry.animeId === 'domingo-legacy')).toBe(false);
    expect(state.order.Domingo).toEqual(['domingo-legacy#0']);
  });

  it('emits changed entries in board destination order before special queues', () => {
    let state = createAnimeScheduleOrderingState(orderedDestinationsBoard);
    state = moveOrderingCard(state, { animeId: 'special-anime', destinationId: 'Visto', order: 1 });
    state = moveOrderingCard(state, { animeId: 'sunday-anime', destinationId: 'Domingo', order: 1 });
    state = moveOrderingCard(state, { animeId: 'monday-anime', destinationId: 'Lunes', order: 1 });

    expect(createAnimeScheduleApplyEntries(orderedDestinationsBoard, state)).toEqual([
      { animeId: 'monday-anime', baseModifiedAt: 201, placements: [{ day: 'Lunes', order: 1 }] },
      { animeId: 'sunday-anime', baseModifiedAt: 203, placements: [{ day: 'Domingo', order: 1 }] },
      { animeId: 'special-anime', baseModifiedAt: 202, placements: [{ day: 'Visto', order: 1 }] },
    ]);
  });

  it('moves one anime into the requested destination order without duplicating it', () => {
    const moved = moveOrderingCard(createAnimeScheduleOrderingState(sparseSundayBoard), {
      animeId: 'bang-dream',
      destinationId: 'Visto',
      order: 5,
    });

    expect(moved.order['Sin ver']).toEqual(['sayonara-lara#0', 'yani-neko#0', 'youjo-senki-ii#0']);
    expect(moved.order.Visto).toEqual(['futsutsuka#0', 'iwamoto#0', 'tai-ari#0', 'tenmaku#0', 'bang-dream#0']);
  });

  it('captures an in-column move as changed entries for every reindexed card', () => {
    const moved = moveOrderingCard(createAnimeScheduleOrderingState(sparseSundayBoard), {
      animeId: 'bang-dream',
      destinationId: 'Sin ver',
      order: 1,
    });

    expect(countAnimeScheduleChanges(sparseSundayBoard, moved)).toBe(4);
    expect(createAnimeScheduleApplyEntries(sparseSundayBoard, moved)).toEqual([
      { animeId: 'bang-dream', baseModifiedAt: 104, placements: [{ day: 'Sin ver', order: 1 }] },
      { animeId: 'sayonara-lara', baseModifiedAt: 101, placements: [{ day: 'Sin ver', order: 2 }] },
      { animeId: 'yani-neko', baseModifiedAt: 102, placements: [{ day: 'Sin ver', order: 3 }] },
      { animeId: 'youjo-senki-ii', baseModifiedAt: 103, placements: [{ day: 'Sin ver', order: 4 }] },
    ]);
  });

  it('adds an empty duplicate-allowed staging destination', () => {
    const state = withStagingDestination(createAnimeScheduleOrderingState(board));

    expect(state.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID]).toEqual([]);
    expect(state.duplicateAllowedDestinations).toContain(ANIME_SCHEDULE_STAGING_CONTAINER_ID);
  });

  it('treats a parked anime as still holding its slot — no ripple, no changes', () => {
    let state = withStagingDestination(createAnimeScheduleOrderingState(sparseSundayBoard));
    state = moveOrderingCard(state, { animeId: 'futsutsuka', destinationId: ANIME_SCHEDULE_STAGING_CONTAINER_ID, order: 1 });

    expect([...getStagedAnimeIds(state)]).toEqual(['futsutsuka']);
    expect(countAnimeScheduleChanges(sparseSundayBoard, state)).toBe(0);
    expect(createAnimeScheduleApplyEntries(sparseSundayBoard, state)).toEqual([]);
  });

  it('releases the ripple once the parked anime lands on a real destination', () => {
    let state = withStagingDestination(createAnimeScheduleOrderingState(sparseSundayBoard));
    state = moveOrderingCard(state, { animeId: 'futsutsuka', destinationId: ANIME_SCHEDULE_STAGING_CONTAINER_ID, order: 1 });
    state = moveOrderingCard(state, { animeId: 'futsutsuka', destinationId: 'Domingo', order: 1 });

    expect(countAnimeScheduleChanges(sparseSundayBoard, state)).toBe(5);
    expect(createAnimeScheduleApplyEntries(sparseSundayBoard, state)).toEqual([
      { animeId: 'futsutsuka', baseModifiedAt: 105, placements: [{ day: 'Domingo', order: 1 }] },
      { animeId: 'domingo-legacy', baseModifiedAt: 109, placements: [{ day: 'Domingo', order: 2 }] },
      { animeId: 'iwamoto', baseModifiedAt: 106, placements: [{ day: 'Visto', order: 1 }] },
      { animeId: 'tai-ari', baseModifiedAt: 107, placements: [{ day: 'Visto', order: 2 }] },
      { animeId: 'tenmaku', baseModifiedAt: 108, placements: [{ day: 'Visto', order: 3 }] },
    ]);
  });

  it('stages duplicates in the wildcard area without dirtying the draft', () => {
    const state = duplicateOrderingCard(withStagingDestination(createAnimeScheduleOrderingState(board)), 'anime-1');

    expect(state.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID]).toHaveLength(1);
    expect(validateAnimeScheduleDraft(state)).toBeUndefined();
    expect(countAnimeScheduleChanges(board, state)).toBe(0);
    expect(createAnimeScheduleApplyEntries(board, state)).toEqual([]);
  });

  it('keeps real-destination moves for an anime whose duplicate is staged', () => {
    let state = duplicateOrderingCard(withStagingDestination(createAnimeScheduleOrderingState(board)), 'anime-1');
    state = moveOrderingCard(state, { animeId: 'anime-1', destinationId: 'Sin ver', order: 1 });

    expect(createAnimeScheduleApplyEntries(board, state)).toEqual([
      { animeId: 'anime-1', baseModifiedAt: 100, placements: [{ day: 'Sin ver', order: 1 }] },
    ]);
  });

  it('formats the staging warning with singular and plural wording', () => {
    expect(formatStagingWarning(1)).toBe('1 anime is parked in the staging area. Apply ignores it — place it on a destination or its staged move will be lost.');
    expect(formatStagingWarning(2)).toBe('2 animes are parked in the staging area. Apply ignores them — place them on a destination or their staged moves will be lost.');
  });

  it('captures a drop between two cards in another destination', () => {
    const moved = moveOrderingCard(createAnimeScheduleOrderingState(sparseSundayBoard), {
      animeId: 'bang-dream',
      destinationId: 'Visto',
      order: 3,
    });

    expect(moved.order['Sin ver']).toEqual(['sayonara-lara#0', 'yani-neko#0', 'youjo-senki-ii#0']);
    expect(moved.order.Visto).toEqual(['futsutsuka#0', 'iwamoto#0', 'bang-dream#0', 'tai-ari#0', 'tenmaku#0']);
    expect(countAnimeScheduleChanges(sparseSundayBoard, moved)).toBe(3);
    expect(createAnimeScheduleApplyEntries(sparseSundayBoard, moved)).toEqual([
      { animeId: 'bang-dream', baseModifiedAt: 104, placements: [{ day: 'Visto', order: 3 }] },
      { animeId: 'tai-ari', baseModifiedAt: 107, placements: [{ day: 'Visto', order: 4 }] },
      { animeId: 'tenmaku', baseModifiedAt: 108, placements: [{ day: 'Visto', order: 5 }] },
    ]);
  });

  // Both of these reach code the editor's own state shape cannot: the module is
  // shared now, and Season builds states whose wildcard is a rail rather than
  // the staging area. An anime sitting only on a wildcard projects to zero
  // placements, which is the one way into the no-placement ordering branch.
  it('orders entries that project to no placement at all by anime id', () => {
    const railBoard = {
      originAnimeId: 'alpha',
      boardModifiedAt: 500,
      destinations: [
        { id: 'Lunes', label: 'Lunes', kind: 'weekday' },
        { id: 'Martes', label: 'Martes', kind: 'weekday' },
        { id: 'Rail', label: 'Rail', kind: 'special' },
      ],
      entries: [
        { animeId: 'beta', name: 'Beta', active: true, modifiedAt: 501, placements: [{ day: 'Lunes', order: 1 }], status: 0, progress: 0, originHighlighted: false },
        { animeId: 'alpha', name: 'Alpha', active: true, modifiedAt: 502, placements: [{ day: 'Martes', order: 1 }], status: 0, progress: 0, originHighlighted: false },
      ],
    } as const;

    let state: AnimeScheduleOrderingState = { ...createAnimeScheduleOrderingState(railBoard), duplicateAllowedDestinations: ['Rail'] };
    state = moveOrderingCard(state, { animeId: 'beta', destinationId: 'Rail', order: 1 });
    state = moveOrderingCard(state, { animeId: 'alpha', destinationId: 'Rail', order: 2 });

    expect(createAnimeScheduleApplyEntries(railBoard, state)).toEqual([
      { animeId: 'alpha', baseModifiedAt: 502, placements: [] },
      { animeId: 'beta', baseModifiedAt: 501, placements: [] },
    ]);
  });

  // Both directions matter: the comparator sees the pair in board order, so a
  // single board only ever exercises one side of the no-placement check.
  it('sorts a placed entry against an unplaced one in both board orders', () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ['unplaced first', 'beta', 'alpha'],
      ['unplaced second', 'alpha', 'beta'],
    ];
    for (const [name, first, second] of cases) {
      const mixedBoard = {
        originAnimeId: first,
        boardModifiedAt: 500,
        destinations: [
          { id: 'Lunes', label: 'Lunes', kind: 'weekday' },
          { id: 'Martes', label: 'Martes', kind: 'weekday' },
          { id: 'Rail', label: 'Rail', kind: 'special' },
        ],
        entries: [first, second].map((animeId, index) => ({
          animeId, name: animeId, active: true, modifiedAt: 500 + index,
          placements: [{ day: 'Lunes', order: index + 1 }],
          status: 0, progress: 0, originHighlighted: false,
        })),
      } as unknown as Parameters<typeof createAnimeScheduleApplyEntries>[0];

      let state: AnimeScheduleOrderingState = { ...createAnimeScheduleOrderingState(mixedBoard), duplicateAllowedDestinations: ['Rail'] };
      state = moveOrderingCard(state, { animeId: 'beta', destinationId: 'Rail', order: 1 });
      state = moveOrderingCard(state, { animeId: 'alpha', destinationId: 'Martes', order: 1 });

      const entries = createAnimeScheduleApplyEntries(mixedBoard, state);

      expect.soft(entries.map((entry) => entry.animeId), `${name}: order`).toEqual(['alpha', 'beta']);
      expect.soft(entries.find((entry) => entry.animeId === 'beta')?.placements, `${name}: unplaced placements`).toEqual([]);
    }
  });

  it('orders two destinations the board no longer declares by name, not by anime id', () => {
    const shrunkBoard = {
      originAnimeId: 'aaa',
      boardModifiedAt: 600,
      destinations: [
        { id: 'Lunes', label: 'Lunes', kind: 'weekday' },
        { id: 'Martes', label: 'Martes', kind: 'weekday' },
      ],
      entries: [
        { animeId: 'aaa', name: 'A', active: true, modifiedAt: 601, placements: [{ day: 'Lunes', order: 1 }], status: 0, progress: 0, originHighlighted: false },
        { animeId: 'zzz', name: 'Z', active: true, modifiedAt: 602, placements: [{ day: 'Martes', order: 1 }], status: 0, progress: 0, originHighlighted: false },
      ],
    } as const;
    const state = {
      order: { Lunes: [], Martes: [], Zebra: ['aaa#0'], Apple: ['zzz#0'] },
      instances: {
        'aaa#0': { key: 'aaa#0', animeId: 'aaa', name: 'A', baseModifiedAt: 601, originHighlighted: false, initialOrder: 1 },
        'zzz#0': { key: 'zzz#0', animeId: 'zzz', name: 'Z', baseModifiedAt: 602, originHighlighted: false, initialOrder: 1 },
      },
    };

    expect(createAnimeScheduleApplyEntries(shrunkBoard, state).map((entry) => entry.animeId)).toEqual(['zzz', 'aaa']);
  });

  it('partitions the create submit into new-anime creates and changed existing neighbors', () => {
    const state = {
      order: { Lunes: ['__draft__:1#0'], 'Sin ver': ['anime-1#0'] },
      instances: {
        'anime-1#0': { key: 'anime-1#0', animeId: 'anime-1', name: 'Frieren', baseModifiedAt: 100, originHighlighted: true, initialOrder: 1 },
        '__draft__:1#0': { key: '__draft__:1#0', animeId: '__draft__:1', name: 'New Anime', baseModifiedAt: 0, originHighlighted: false },
      },
    };

    const result = partitionCreateSubmit(board, state);

    expect(result.creates).toEqual({ '__draft__:1': [{ day: 'Lunes', order: 1 }] });
    expect(result.changedNeighbors).toEqual([
      { animeId: 'anime-1', baseModifiedAt: 100, placements: [{ day: 'Sin ver', order: 1 }] },
    ]);
  });

  it('seeds one non-origin draft card per row into the staging area, and nothing without rows', () => {
    const staged = withStagingDestination(createAnimeScheduleOrderingState(board));
    const seeded = seedDraftEntries(staged, [
      { draftId: '__draft__:1', name: 'New Anime One' },
      { draftId: '__draft__:2', name: 'New Anime Two' },
    ]);
    const seededInstances = seeded.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID].map((key) => seeded.instances[key]);

    expect.soft(seeded.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID], 'one card per row').toHaveLength(2);
    expect.soft(seededInstances.map((instance) => instance.animeId), 'synthetic ids').toEqual(['__draft__:1', '__draft__:2']);
    expect.soft(seededInstances.map((instance) => instance.name), 'names').toEqual(['New Anime One', 'New Anime Two']);
    expect.soft(seeded.instances['__draft__:1#0'].originHighlighted, 'never the origin anime').toBe(false);
    // Edit-mode regression: no rows is a no-op.
    expect.soft(seedDraftEntries(staged, undefined), 'undefined rows').toBe(staged);
    expect.soft(seedDraftEntries(staged, []), 'empty rows').toBe(staged);
    expect
      .soft(seedDraftEntries(createAnimeScheduleOrderingState(board), [{ draftId: '__draft__:1', name: 'New Anime' }]).order[ANIME_SCHEDULE_STAGING_CONTAINER_ID], 'no wildcard declared')
      .toEqual(['__draft__:1#0']);
  });

  it('locks the matching instances and is a no-op without locked ids', () => {
    const state = createAnimeScheduleOrderingState(board);

    expect.soft(applyLockedAnimeIds(state, ['anime-1']).instances['anime-1#0'].locked, 'matching id').toBe(true);
    // Edit-mode regression: no ids is a no-op.
    expect.soft(applyLockedAnimeIds(state, undefined), 'undefined ids').toBe(state);
    expect.soft(applyLockedAnimeIds(state, []), 'empty ids').toBe(state);
  });

  it('reconciles draft entries: seeds new rows, renames existing ones, and removes dropped rows', () => {
    let state = withStagingDestination(createAnimeScheduleOrderingState(board));

    state = reconcileDraftEntries(state, [{ draftId: '__draft__:1', name: 'New anime' }]);
    expect(state.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID]).toHaveLength(1);

    state = reconcileDraftEntries(state, [
      { draftId: '__draft__:1', name: 'Frieren' },
      { draftId: '__draft__:2', name: 'New anime' },
    ]);
    expect(state.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID]).toHaveLength(2);
    const names = state.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID].map((key) => state.instances[key].name);
    expect(names).toEqual(['Frieren', 'New anime']);

    state = reconcileDraftEntries(state, [{ draftId: '__draft__:2', name: 'New anime' }]);
    expect(state.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID]).toHaveLength(1);
    expect(state.instances[state.order[ANIME_SCHEDULE_STAGING_CONTAINER_ID][0]].animeId).toBe('__draft__:2');
  });

  it('returns a reconciled state unchanged when nothing changed and renames without touching the order', () => {
    const state = reconcileDraftEntries(withStagingDestination(createAnimeScheduleOrderingState(board)), [{ draftId: '__draft__:1', name: 'New anime' }]);

    // Regression against re-render loops.
    expect.soft(reconcileDraftEntries(state, [{ draftId: '__draft__:1', name: 'New anime' }]), 'same rows').toBe(state);
    expect.soft(reconcileDraftEntries(state, undefined), 'undefined rows').toBe(state);
    // An empty list is not "every row was deleted": create mode clears the prop
    // between renders, and treating that as a removal wiped the staged cards.
    expect.soft(reconcileDraftEntries(state, []), 'empty rows').toBe(state);

    const renamed = reconcileDraftEntries(state, [{ draftId: '__draft__:1', name: 'Renamed' }]);

    expect.soft(renamed.instances['__draft__:1#0'].name, 'renamed draft card').toBe('Renamed');
    expect.soft(renamed.instances['anime-1#0'].name, 'board card untouched').toBe('Frieren');
    expect.soft(renamed.order, 'order map untouched').toBe(state.order);
  });
});
