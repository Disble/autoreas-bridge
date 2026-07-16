import { describe, expect, it } from 'vitest';
import { countAnimeScheduleChanges, createAnimeScheduleApplyEntries, createAnimeScheduleOrderingState, duplicateAnimeScheduleCard, validateAnimeScheduleDraft } from '../anime-schedule-ordering.helpers';

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
});
