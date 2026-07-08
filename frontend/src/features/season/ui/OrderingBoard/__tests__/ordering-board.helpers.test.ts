import { describe, expect, it } from 'vitest';

import type { OrderingCard } from '../../../../../infrastructure/season-source';
import { WEEKDAYS } from '../ordering-board.constants';
import {
  addToDay,
  buildDraft,
  countChanges,
  groupGridByDay,
  initialWorkingState,
  moveClone,
  moveWithinDay,
  removeFromDay,
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
      // multi-day: the same anime appears on two days
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
  it('emits one placement per weekday clone (multi-day) and a section placement for rail cards', () => {
    const columns = {
      Lunes: [card({ animeId: 'z' })],
      Miércoles: [card({ animeId: 'z' }), card({ animeId: 'w' })],
    };
    const rail = [card({ animeId: 'r1', section: 'Visto', orden: 3 })];
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

describe('working-state moves', () => {
  it('addToDay places a rail card at the end of a column, renumbered, and leaves the rail', () => {
    const start = initialWorkingState({
      rail: [card({ animeId: 'r', section: 'Visto' })],
      grid: [card({ animeId: 'g', dia: 'Jueves', orden: 1 })],
    });
    const next = addToDay(start, 'r', 'Jueves', Number.MAX_SAFE_INTEGER);
    expect(next.columns['Jueves'].map((c) => c.animeId)).toEqual(['g', 'r']);
    expect(next.columns['Jueves'].map((c) => c.orden)).toEqual([1, 2]);
    expect(next.rail).toHaveLength(0);
  });

  it('addToDay clones an already-placed anime onto a SECOND day, keeping the first (multi-day)', () => {
    const start = initialWorkingState({ rail: [], grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 })] });
    const next = addToDay(start, 'z', 'Miércoles', Number.MAX_SAFE_INTEGER);
    expect(next.columns['Lunes'].map((c) => c.animeId)).toEqual(['z']);
    expect(next.columns['Miércoles'].map((c) => c.animeId)).toEqual(['z']);
  });

  it('removeFromDay drops one clone; the anime stays placed while another day remains', () => {
    const start = initialWorkingState({
      rail: [],
      grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 }), card({ animeId: 'z', dia: 'Miércoles', orden: 1 })],
    });
    const next = removeFromDay(start, 'z', 'Lunes');
    expect(next.columns['Lunes']).toHaveLength(0);
    expect(next.columns['Miércoles'].map((c) => c.animeId)).toEqual(['z']);
    expect(next.rail).toHaveLength(0);
  });

  it('removeFromDay returns the anime to the rail when it was its last placement', () => {
    const start = initialWorkingState({ rail: [], grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] });
    const next = removeFromDay(start, 'g', 'Lunes');
    expect(next.rail.map((c) => c.animeId)).toEqual(['g']);
    expect(next.columns['Lunes']).toHaveLength(0);
  });

  it('moveClone moves a clone between days at the drop position, renumbering both', () => {
    const start = initialWorkingState({
      rail: [],
      grid: [
        card({ animeId: 'a', dia: 'Jueves', orden: 1 }),
        card({ animeId: 'b', dia: 'Jueves', orden: 2 }),
        card({ animeId: 'c', dia: 'Lunes', orden: 1 }),
      ],
    });
    const next = moveClone(start, 'c', 'Lunes', 'Jueves', 1); // drop between a and b
    expect(next.columns['Jueves'].map((c) => c.animeId)).toEqual(['a', 'c', 'b']);
    expect(next.columns['Jueves'].map((c) => c.orden)).toEqual([1, 2, 3]);
    expect(next.columns['Lunes']).toHaveLength(0);
  });

  it('moveClone reorders within the same day when source and target match', () => {
    const start = initialWorkingState({
      rail: [],
      grid: [card({ animeId: 'a', dia: 'Lunes', orden: 1 }), card({ animeId: 'b', dia: 'Lunes', orden: 2 })],
    });
    const next = moveClone(start, 'b', 'Lunes', 'Lunes', 0);
    expect(next.columns['Lunes'].map((c) => c.animeId)).toEqual(['b', 'a']);
  });

  it('moveWithinDay swaps neighbours in the given day and no-ops at the bounds', () => {
    const start = initialWorkingState({
      rail: [],
      grid: [card({ animeId: 'a', dia: 'Lunes', orden: 1 }), card({ animeId: 'b', dia: 'Lunes', orden: 2 })],
    });
    const down = moveWithinDay(start, 'a', 'Lunes', 'down');
    expect(down.columns['Lunes'].map((c) => c.animeId)).toEqual(['b', 'a']);
    const noop = moveWithinDay(start, 'a', 'Lunes', 'up');
    expect(noop.columns['Lunes'].map((c) => c.animeId)).toEqual(['a', 'b']);
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
    // Working: a stays, z loses Miércoles (multi-day change), c placed into Lunes.
    const columns = {
      Jueves: [card({ animeId: 'a', dia: 'Jueves', orden: 1 })],
      Lunes: [card({ animeId: 'z', dia: 'Lunes', orden: 1 }), card({ animeId: 'c', section: 'Visto', orden: 1 })],
    };
    expect(countChanges({ rail, grid }, columns, [])).toBe(2); // z and c changed, a unchanged
  });
});
