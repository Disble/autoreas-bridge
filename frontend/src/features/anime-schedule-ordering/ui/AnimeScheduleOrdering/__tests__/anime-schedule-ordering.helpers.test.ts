import { describe, expect, it } from 'vitest';
import { countAnimeScheduleChanges, createAnimeScheduleApplyEntries, createAnimeScheduleOrderingState, duplicateAnimeScheduleCard, moveAnimeScheduleCard, validateAnimeScheduleDraft } from '../anime-schedule-ordering.helpers';

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

describe('anime-schedule-ordering.helpers', () => {
  it('builds the editable state from the board', () => {
    const state = createAnimeScheduleOrderingState(board);
    expect(state.order.Lunes).toHaveLength(1);
  });

  it('flags duplicate cards in one destination', () => {
    const invalid = duplicateAnimeScheduleCard(createAnimeScheduleOrderingState(board), 'anime-1');
    expect(validateAnimeScheduleDraft(invalid)).toContain('Each destination');
  });

  it('counts draft changes and emits changed-record-only apply entries', () => {
    const invalid = duplicateAnimeScheduleCard(createAnimeScheduleOrderingState(board), 'anime-1');
    expect(countAnimeScheduleChanges(board, invalid)).toBe(1);
    expect(createAnimeScheduleApplyEntries(board, invalid)).toHaveLength(1);
  });

  it('reports every reindexed queue card and preserves sparse Sunday membership', () => {
    let state = createAnimeScheduleOrderingState(sparseSundayBoard);
    state = moveAnimeScheduleCard(state, { animeId: 'bang-dream', destinationId: 'Visto', order: 1 });
    state = moveAnimeScheduleCard(state, { animeId: 'yani-neko', destinationId: 'Visto', order: 2 });
    state = moveAnimeScheduleCard(state, { animeId: 'sayonara-lara', destinationId: 'Visto', order: 3 });

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
    state = moveAnimeScheduleCard(state, { animeId: 'special-anime', destinationId: 'Visto', order: 1 });
    state = moveAnimeScheduleCard(state, { animeId: 'sunday-anime', destinationId: 'Domingo', order: 1 });
    state = moveAnimeScheduleCard(state, { animeId: 'monday-anime', destinationId: 'Lunes', order: 1 });

    expect(createAnimeScheduleApplyEntries(orderedDestinationsBoard, state)).toEqual([
      { animeId: 'monday-anime', baseModifiedAt: 201, placements: [{ day: 'Lunes', order: 1 }] },
      { animeId: 'sunday-anime', baseModifiedAt: 203, placements: [{ day: 'Domingo', order: 1 }] },
      { animeId: 'special-anime', baseModifiedAt: 202, placements: [{ day: 'Visto', order: 1 }] },
    ]);
  });

  it('moves one anime into the requested destination order without duplicating it', () => {
    const moved = moveAnimeScheduleCard(createAnimeScheduleOrderingState(sparseSundayBoard), {
      animeId: 'bang-dream',
      destinationId: 'Visto',
      order: 5,
    });

    expect(moved.order['Sin ver']).toEqual(['sayonara-lara#0', 'yani-neko#0', 'youjo-senki-ii#0']);
    expect(moved.order.Visto).toEqual(['futsutsuka#0', 'iwamoto#0', 'tai-ari#0', 'tenmaku#0', 'bang-dream#0']);
  });

  it('captures an in-column move as changed entries for every reindexed card', () => {
    const moved = moveAnimeScheduleCard(createAnimeScheduleOrderingState(sparseSundayBoard), {
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

  it('captures a drop between two cards in another destination', () => {
    const moved = moveAnimeScheduleCard(createAnimeScheduleOrderingState(sparseSundayBoard), {
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
});
