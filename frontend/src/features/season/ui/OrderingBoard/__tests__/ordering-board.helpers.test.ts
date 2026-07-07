import { describe, expect, it } from 'vitest';

import type { OrderingCard } from '../../../../../infrastructure/season-source';
import { WEEKDAYS } from '../ordering-board.constants';
import {
  countChanges,
  groupGridByDay,
  initialWorkingState,
  moveToDay,
  moveWithinDay,
  renumber,
  returnToRail,
  serializeDraft,
} from '../ordering-board.helpers';

function card(overrides: Partial<OrderingCard> = {}): OrderingCard {
  return { animeId: 'a', name: 'A', dia: '', orden: 0, section: 'Visto', isNewcomer: false, ...overrides };
}

describe('groupGridByDay', () => {
  it('groups grid cards by weekday, sorted by orden, all seven columns present', () => {
    const grid = [
      card({ animeId: 'x', dia: 'Jueves', orden: 2 }),
      card({ animeId: 'y', dia: 'Jueves', orden: 1 }),
      card({ animeId: 'z', dia: 'Lunes', orden: 1 }),
    ];
    const cols = groupGridByDay(grid);
    expect(Object.keys(cols)).toHaveLength(WEEKDAYS.length);
    expect(cols['Jueves'].map((c) => c.animeId)).toEqual(['y', 'x']); // sorted by orden
    expect(cols['Domingo']).toEqual([]);
  });
});

describe('renumber', () => {
  it('reassigns orden 1..N by current position', () => {
    const out = renumber([card({ animeId: 'a', orden: 9 }), card({ animeId: 'b', orden: 4 })]);
    expect(out.map((c) => c.orden)).toEqual([1, 2]);
  });
});

describe('serializeDraft', () => {
  it('emits weekday placements (renumbered) for grid cards and section placements for rail cards', () => {
    const columns = { Jueves: [card({ animeId: 'g1' }), card({ animeId: 'g2' })] };
    const rail = [card({ animeId: 'r1', section: 'Visto', orden: 3 })];
    const draft = JSON.parse(serializeDraft(columns, rail)) as Record<string, { dia: string; orden: number }[]>;

    expect(draft['g1']).toEqual([{ dia: 'Jueves', orden: 1 }]);
    expect(draft['g2']).toEqual([{ dia: 'Jueves', orden: 2 }]);
    expect(draft['r1']).toEqual([{ dia: 'Visto', orden: 3 }]);
  });
});

describe('working-state moves', () => {
  it('moveToDay places a rail card at the end of a column, renumbered', () => {
    const start = initialWorkingState({
      rail: [card({ animeId: 'r', section: 'Visto' })],
      grid: [card({ animeId: 'g', dia: 'Jueves', orden: 1 })],
    });
    const next = moveToDay(start, 'r', 'Jueves');
    expect(next.columns['Jueves'].map((c) => c.animeId)).toEqual(['g', 'r']);
    expect(next.columns['Jueves'].map((c) => c.orden)).toEqual([1, 2]);
    expect(next.rail).toHaveLength(0);
  });

  it('returnToRail sends a weekday card back to the rail', () => {
    const start = initialWorkingState({ rail: [], grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] });
    const next = returnToRail(start, 'g');
    expect(next.rail.map((c) => c.animeId)).toEqual(['g']);
    expect(next.columns['Lunes']).toHaveLength(0);
  });

  it('moveWithinDay swaps neighbours and no-ops at the bounds', () => {
    const start = initialWorkingState({
      rail: [],
      grid: [card({ animeId: 'a', dia: 'Lunes', orden: 1 }), card({ animeId: 'b', dia: 'Lunes', orden: 2 })],
    });
    const down = moveWithinDay(start, 'a', 'down');
    expect(down.columns['Lunes'].map((c) => c.animeId)).toEqual(['b', 'a']);
    const noop = moveWithinDay(start, 'a', 'up'); // already first
    expect(noop.columns['Lunes'].map((c) => c.animeId)).toEqual(['a', 'b']);
  });
});

describe('countChanges', () => {
  it('counts animes whose working placement differs from the loaded board', () => {
    const grid = [card({ animeId: 'a', dia: 'Jueves', orden: 1 }), card({ animeId: 'b', dia: 'Viernes', orden: 1 })];
    const rail = [card({ animeId: 'c', section: 'Visto', orden: 1 })];
    // Working: a stays, b moved Viernes→Sábado, c placed into Lunes.
    const columns = {
      Jueves: [card({ animeId: 'a', dia: 'Jueves', orden: 1 })],
      Sábado: [card({ animeId: 'b', dia: 'Viernes', orden: 1 })],
      Lunes: [card({ animeId: 'c', section: 'Visto', orden: 1 })],
    };
    expect(countChanges({ rail, grid }, columns, [])).toBe(2); // b and c changed, a unchanged
  });
});
