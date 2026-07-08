import { describe, expect, it } from 'vitest';

import type { OrderingCard } from '../../../../../infrastructure/season-source';
import { WEEKDAYS } from '../ordering-board.constants';
import {
  buildDraft,
  cardCount,
  countChanges,
  duplicate,
  groupGridByDay,
  initialWorkingState,
  moveClone,
  RAIL,
  removeCard,
  renumber,
  serializeDraft,
} from '../ordering-board.helpers';

function card(overrides: Partial<OrderingCard> = {}): OrderingCard {
  return { animeId: 'a', name: 'A', dia: '', orden: 0, section: 'Visto', isNewcomer: false, ...overrides };
}

describe('groupGridByDay', () => {
  it('groups grid cards by weekday (clones included), sorted by orden, all seven columns present', () => {
    const grid = [
      card({ animeId: 'x', dia: 'Jueves', orden: 2 }),
      card({ animeId: 'y', dia: 'Jueves', orden: 1 }),
      card({ animeId: 'z', dia: 'Lunes', orden: 1 }),
      card({ animeId: 'z', dia: 'Miércoles', orden: 1 }),
    ];
    const cols = groupGridByDay(grid);
    expect(Object.keys(cols)).toHaveLength(WEEKDAYS.length);
    expect(cols['Jueves'].map((c) => c.animeId)).toEqual(['y', 'x']);
    expect(cols['Lunes'].map((c) => c.animeId)).toEqual(['z']);
    expect(cols['Miércoles'].map((c) => c.animeId)).toEqual(['z']);
    expect(cols['Domingo']).toEqual([]);
  });
});

describe('renumber', () => {
  it('reassigns orden 1..N by current position', () => {
    const out = renumber([card({ animeId: 'a', orden: 9 }), card({ animeId: 'b', orden: 4 })]);
    expect(out.map((c) => c.orden)).toEqual([1, 2]);
  });
});

describe('buildDraft / serializeDraft', () => {
  it('emits one placement per weekday clone (multi-day) and skips empty-section rail duplicates', () => {
    const columns = {
      Lunes: [card({ animeId: 'z' })],
      Miércoles: [card({ animeId: 'z' }), card({ animeId: 'w' })],
    };
    const rail = [
      card({ animeId: 'r1', section: 'Visto', orden: 3 }),
      card({ animeId: 'z', section: '' }), // a pending duplicate of an already-placed anime: adds nothing
    ];
    const draft = buildDraft(columns, rail);

    expect(draft['z']).toEqual([
      { dia: 'Lunes', orden: 1 },
      { dia: 'Miércoles', orden: 1 },
    ]);
    expect(draft['w']).toEqual([{ dia: 'Miércoles', orden: 2 }]);
    expect(draft['r1']).toEqual([{ dia: 'Visto', orden: 3 }]);
    expect(JSON.parse(serializeDraft(columns, rail))).toEqual(draft);
  });
});

describe('duplicate + removeCard (min-one, no dup-per-day)', () => {
  it('duplicate stages one rail copy of a placed anime and is a no-op when a copy already waits', () => {
    const start = initialWorkingState({ rail: [], grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 })] });
    const once = duplicate(start, 'z');
    expect(once.rail.map((c) => c.animeId)).toEqual(['z']);
    expect(cardCount(once, 'z')).toBe(2);
    const twice = duplicate(once, 'z');
    expect(twice.rail).toHaveLength(1); // no second pending copy
  });

  it('removeCard deletes a copy but never the anime last card', () => {
    const start = initialWorkingState({
      rail: [],
      grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 }), card({ animeId: 'z', dia: 'Miércoles', orden: 1 })],
    });
    const afterOne = removeCard(start, 'z', 'Lunes');
    expect(afterOne.columns['Lunes']).toHaveLength(0);
    expect(afterOne.columns['Miércoles'].map((c) => c.animeId)).toEqual(['z']);
    // now z has a single card — it cannot be deleted
    const blocked = removeCard(afterOne, 'z', 'Miércoles');
    expect(blocked).toBe(afterOne);
  });
});

describe('moveClone (the one drag primitive)', () => {
  it('places a rail card onto a day at the drop position, renumbered, leaving the rail', () => {
    const start = initialWorkingState({
      rail: [card({ animeId: 'r', section: 'Visto' })],
      grid: [card({ animeId: 'a', dia: 'Jueves', orden: 1 }), card({ animeId: 'b', dia: 'Jueves', orden: 2 })],
    });
    const next = moveClone(start, 'r', RAIL, 'Jueves', 1); // between a and b
    expect(next.columns['Jueves'].map((c) => c.animeId)).toEqual(['a', 'r', 'b']);
    expect(next.columns['Jueves'].map((c) => c.orden)).toEqual([1, 2, 3]);
    expect(next.rail).toHaveLength(0);
  });

  it('moves a clone between days, renumbering both', () => {
    const start = initialWorkingState({
      rail: [],
      grid: [card({ animeId: 'a', dia: 'Jueves', orden: 1 }), card({ animeId: 'c', dia: 'Lunes', orden: 1 })],
    });
    const next = moveClone(start, 'c', 'Lunes', 'Jueves', 0);
    expect(next.columns['Jueves'].map((c) => c.animeId)).toEqual(['c', 'a']);
    expect(next.columns['Lunes']).toHaveLength(0);
  });

  it('reorders within the same day when source and target match', () => {
    const start = initialWorkingState({
      rail: [],
      grid: [card({ animeId: 'a', dia: 'Lunes', orden: 1 }), card({ animeId: 'b', dia: 'Lunes', orden: 2 })],
    });
    const next = moveClone(start, 'b', 'Lunes', 'Lunes', 0);
    expect(next.columns['Lunes'].map((c) => c.animeId)).toEqual(['b', 'a']);
  });

  it('rejects a drop onto a day that already holds the anime (no two copies per day)', () => {
    const start = initialWorkingState({
      rail: [card({ animeId: 'z', section: '' })],
      grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 })],
    });
    const next = moveClone(start, 'z', RAIL, 'Lunes', 0);
    expect(next).toBe(start); // rejected — z is already on Lunes
  });

  it('unplaces a clone when dropped onto the rail', () => {
    const start = initialWorkingState({ rail: [], grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] });
    const next = moveClone(start, 'g', 'Lunes', RAIL, 0);
    expect(next.rail.map((c) => c.animeId)).toEqual(['g']);
    expect(next.columns['Lunes']).toHaveLength(0);
  });
});

describe('countChanges', () => {
  it('counts animes whose placement set differs, ignoring stable multi-day layouts', () => {
    const grid = [
      card({ animeId: 'a', dia: 'Jueves', orden: 1 }),
      card({ animeId: 'z', dia: 'Lunes', orden: 1 }),
      card({ animeId: 'z', dia: 'Miércoles', orden: 1 }),
    ];
    const rail = [card({ animeId: 'c', section: 'Visto', orden: 1 })];
    const columns = {
      Jueves: [card({ animeId: 'a', dia: 'Jueves', orden: 1 })],
      Lunes: [card({ animeId: 'z', dia: 'Lunes', orden: 1 }), card({ animeId: 'c', section: 'Visto', orden: 1 })],
    };
    expect(countChanges({ rail, grid }, columns, [])).toBe(2); // z (lost Miércoles) and c (placed), a unchanged
  });
});
