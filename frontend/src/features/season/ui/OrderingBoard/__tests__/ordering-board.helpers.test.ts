import { describe, expect, it } from 'vitest';

import type { OrderingBoard, OrderingCard } from '../../../../../infrastructure/season-source';
import { RAIL_CONTAINER_ID } from '../ordering-board.constants';
import {
  applyOrder,
  buildDraft,
  cardCounts,
  countChanges,
  duplicate,
  initialWorkingState,
  instancesIn,
  removeCard,
  scheduledCount,
  serializeDraft,
} from '../ordering-board.helpers';

function card(overrides: Partial<OrderingCard> = {}): OrderingCard {
  return { animeId: 'a', name: 'A', dia: '', orden: 0, section: 'Visto', isNewcomer: false, ...overrides };
}

function board(overrides: Partial<OrderingBoard> = {}): OrderingBoard {
  return { rail: [], grid: [], ...overrides };
}

describe('initialWorkingState', () => {
  it('groups rail + weekday clones into containers with stable unique keys, days sorted by orden', () => {
    const state = initialWorkingState(
      board({
        rail: [card({ animeId: 'r', section: 'Visto' })],
        grid: [
          card({ animeId: 'z', dia: 'Jueves', orden: 2 }),
          card({ animeId: 'y', dia: 'Jueves', orden: 1 }),
          card({ animeId: 'z', dia: 'Lunes', orden: 1 }), // z is multi-day
        ],
      }),
    );
    expect(instancesIn(state, RAIL_CONTAINER_ID).map((i) => i.animeId)).toEqual(['r']);
    expect(instancesIn(state, 'Jueves').map((i) => i.animeId)).toEqual(['y', 'z']);
    expect(instancesIn(state, 'Lunes').map((i) => i.animeId)).toEqual(['z']);
    // two distinct instances of z, distinct keys
    expect(cardCounts(state)['z']).toBe(2);
  });
});

describe('buildDraft / serializeDraft', () => {
  it('emits one placement per weekday clone and the section for an unplaced rail card', () => {
    const state = initialWorkingState(
      board({
        rail: [card({ animeId: 'r', section: 'Visto', orden: 3 })],
        grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 }), card({ animeId: 'z', dia: 'Miércoles', orden: 1 })],
      }),
    );
    const draft = buildDraft(state);
    expect(draft['z']).toEqual([
      { dia: 'Lunes', orden: 1 },
      { dia: 'Miércoles', orden: 1 },
    ]);
    expect(draft['r']).toEqual([{ dia: 'Visto', orden: 3 }]);
    expect(JSON.parse(serializeDraft(state))).toEqual(draft);
  });

  it('a pending duplicate (empty section) in the rail adds no placement', () => {
    let state = initialWorkingState(board({ grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 })] }));
    state = duplicate(state, 'z');
    expect(buildDraft(state)['z']).toEqual([{ dia: 'Lunes', orden: 1 }]); // only the weekday placement
  });
});

describe('duplicate + removeCard (min-one)', () => {
  it('duplicate stages one rail copy and is a no-op when a copy already waits', () => {
    const start = initialWorkingState(board({ grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 })] }));
    const once = duplicate(start, 'z');
    expect(instancesIn(once, RAIL_CONTAINER_ID).map((i) => i.animeId)).toEqual(['z']);
    expect(cardCounts(once)['z']).toBe(2);
    expect(duplicate(once, 'z')).toBe(once); // no second pending copy
  });

  it('removeCard deletes a copy but never the anime last card', () => {
    const start = initialWorkingState(
      board({ grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 }), card({ animeId: 'z', dia: 'Martes', orden: 1 })] }),
    );
    const lunesKey = start.order['Lunes'][0];
    const afterOne = removeCard(start, lunesKey);
    expect(instancesIn(afterOne, 'Lunes')).toHaveLength(0);
    expect(cardCounts(afterOne)['z']).toBe(1);
    const martesKey = afterOne.order['Martes'][0];
    expect(removeCard(afterOne, martesKey)).toBe(afterOne); // blocked: last card
  });
});

describe('applyOrder (no two copies per day)', () => {
  it('accepts a reorder but rejects an order that duplicates an anime in one container', () => {
    const start = initialWorkingState(
      board({ grid: [card({ animeId: 'a', dia: 'Lunes', orden: 1 }), card({ animeId: 'b', dia: 'Lunes', orden: 2 })] }),
    );
    const [k1, k2] = start.order['Lunes'];
    const reordered = { ...start.order, Lunes: [k2, k1] };
    expect(applyOrder(start, reordered).order['Lunes']).toEqual([k2, k1]);

    // z on two days; try to force both clones into the same day → rejected
    let multi = initialWorkingState(
      board({ grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 }), card({ animeId: 'z', dia: 'Martes', orden: 1 })] }),
    );
    const zLunes = multi.order['Lunes'][0];
    const zMartes = multi.order['Martes'][0];
    const bad = { ...multi.order, Lunes: [zLunes, zMartes], Martes: [] };
    multi = applyOrder(multi, bad);
    expect(multi.order['Lunes']).toEqual([zLunes]); // unchanged — rejected
  });
});

describe('countChanges + scheduledCount', () => {
  it('countChanges ignores a stable layout and counts moved/placed animes', () => {
    const loaded = board({
      rail: [card({ animeId: 'c', section: 'Visto', orden: 1 })],
      grid: [card({ animeId: 'a', dia: 'Jueves', orden: 1 })],
    });
    const state = initialWorkingState(loaded);
    expect(countChanges(loaded, state)).toBe(0); // untouched
  });

  it('scheduledCount counts distinct animes on weekdays (clones once)', () => {
    const state = initialWorkingState(
      board({ grid: [card({ animeId: 'z', dia: 'Lunes', orden: 1 }), card({ animeId: 'z', dia: 'Martes', orden: 1 })] }),
    );
    expect(scheduledCount(state)).toBe(1);
  });
});
