import { describe, expect, it } from 'vitest';

import {
  applyOrdering,
  duplicateOrderingCard,
  findKeyForAnime,
  getInstancesIn,
  moveOrderingCard,
  nextInstanceKey,
  removeOrderingCard,
  resolveContainerOf,
  shouldBlockDuplicateHover,
} from '../ordering.helpers';
import type { OrderingInstanceBase, OrderingState } from '../ordering.types';

/** A card carrying a feature-specific field, to prove the state machine is generic. */
interface TestInstance extends OrderingInstanceBase {
  readonly label: string;
}

/**
 * Builds a two-container board: `rail` is a wildcard, `monday` is exclusive.
 * @returns A state with `a#0` on monday and `b#0` on the rail.
 */
function buildState(): OrderingState<TestInstance> {
  return {
    order: { monday: ['a#0'], rail: ['b#0'] },
    instances: {
      'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
      'b#0': { key: 'b#0', animeId: 'b', label: 'Anime B' },
    },
    duplicateAllowedDestinations: ['rail'],
  };
}

/**
 * Builds a drag-over event pointing from one sortable id to another.
 * @param sourceId The dragged card's key.
 * @param targetId The hovered card or container id.
 * @returns An event shaped like the fields the guard reads.
 */
function dragOver(sourceId: string, targetId: string) {
  return { operation: { source: { id: sourceId }, target: { id: targetId } } } as Parameters<
    typeof shouldBlockDuplicateHover
  >[1];
}

describe('nextInstanceKey', () => {
  it('starts at index 0 for an anime with no cards', () => {
    expect(nextInstanceKey({}, 'a')).toBe('a#0');
  });

  it('skips indexes already taken so keys stay unique', () => {
    const instances = {
      'a#0': { key: 'a#0', animeId: 'a', label: 'x' },
      'a#1': { key: 'a#1', animeId: 'a', label: 'x' },
    };

    expect(nextInstanceKey(instances, 'a')).toBe('a#2');
  });
});

describe('resolveContainerOf', () => {
  it('returns the id itself when it is already a container', () => {
    expect(resolveContainerOf(buildState(), 'monday')).toBe('monday');
  });

  it('returns the container holding a card id', () => {
    expect(resolveContainerOf(buildState(), 'b#0')).toBe('rail');
  });

  it('returns undefined for an id that is neither', () => {
    expect(resolveContainerOf(buildState(), 'nope')).toBeUndefined();
  });
});

describe('findKeyForAnime', () => {
  it('finds the key of the first card for an anime', () => {
    expect(findKeyForAnime(buildState(), 'b')).toBe('b#0');
  });

  it('returns undefined when the anime has no card', () => {
    expect(findKeyForAnime(buildState(), 'zzz')).toBeUndefined();
  });

  it('skips a dangling key in the order without throwing', () => {
    const state: OrderingState<TestInstance> = {
      order: { monday: ['ghost#0', 'a#0'] },
      instances: { 'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' } },
    };

    expect(findKeyForAnime(state, 'a')).toBe('a#0');
  });
});

describe('getInstancesIn', () => {
  it('returns the ordered instances of a container', () => {
    expect(getInstancesIn(buildState(), 'monday').map((instance) => instance.label)).toEqual(['Anime A']);
  });

  it('returns an empty list for an unknown container', () => {
    expect(getInstancesIn(buildState(), 'nope')).toEqual([]);
  });
});

describe('shouldBlockDuplicateHover', () => {
  it('blocks a hover that would put the same anime twice in an exclusive container', () => {
    const state: OrderingState<TestInstance> = {
      order: { monday: ['a#0'], rail: ['a#1'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'a#1': { key: 'a#1', animeId: 'a', label: 'Anime A' },
      },
      duplicateAllowedDestinations: ['rail'],
    };

    expect(shouldBlockDuplicateHover(state, dragOver('a#1', 'monday'))).toBe(true);
  });

  // The wildcard must already HOLD a card of the same anime. With an empty rail
  // the duplicate scan finds nothing there anyway, so the test passes whether or
  // not the wildcard rule exists — it names the rule without being able to
  // detect its removal.
  it('allows the duplicate when the target container is a wildcard that already holds that anime', () => {
    const state: OrderingState<TestInstance> = {
      order: { monday: ['a#0'], rail: ['a#1'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'a#1': { key: 'a#1', animeId: 'a', label: 'Anime A' },
      },
      duplicateAllowedDestinations: ['rail'],
    };

    expect(shouldBlockDuplicateHover(state, dragOver('a#0', 'rail'))).toBe(false);
  });

  it('allows a hover onto the container the card already sits in', () => {
    expect(shouldBlockDuplicateHover(buildState(), dragOver('a#0', 'monday'))).toBe(false);
  });

  it('allows the hover when no container is declared a wildcard', () => {
    const state: OrderingState<TestInstance> = {
      order: { monday: ['a#0'], rail: ['b#0'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'b#0': { key: 'b#0', animeId: 'b', label: 'Anime B' },
      },
    };

    expect(shouldBlockDuplicateHover(state, dragOver('b#0', 'monday'))).toBe(false);
  });

  it('ignores a dangling key that no instance backs', () => {
    const state: OrderingState<TestInstance> = {
      order: { monday: ['ghost#9'], rail: ['b#0'] },
      instances: { 'b#0': { key: 'b#0', animeId: 'b', label: 'Anime B' } },
      duplicateAllowedDestinations: ['rail'],
    };

    expect(shouldBlockDuplicateHover(state, dragOver('b#0', 'monday'))).toBe(false);
  });

  it('allows a hover that introduces no duplicate', () => {
    expect(shouldBlockDuplicateHover(buildState(), dragOver('b#0', 'monday'))).toBe(false);
  });

  it('blocks only when the duplicate is among several cards, not merely when one card matches', () => {
    const state: OrderingState<TestInstance> = {
      order: { monday: ['b#0', 'a#0'], rail: ['a#1'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'a#1': { key: 'a#1', animeId: 'a', label: 'Anime A' },
        'b#0': { key: 'b#0', animeId: 'b', label: 'Anime B' },
      },
      duplicateAllowedDestinations: ['rail'],
    };

    expect(shouldBlockDuplicateHover(state, dragOver('a#1', 'monday'))).toBe(true);
  });

  it('allows the hover when the dragged id is not a string', () => {
    const event = { operation: { source: { id: 7 }, target: { id: 'monday' } } } as Parameters<
      typeof shouldBlockDuplicateHover
    >[1];

    expect(shouldBlockDuplicateHover(buildState(), event)).toBe(false);
  });

  // The numeric id has to name a container that would otherwise resolve.
  // Against a target that resolves to nothing, dropping the `typeof` guard
  // changes no answer, so the test cannot see the guard disappear. A numeric
  // object key resolves through `Object.hasOwn`, which is exactly the coercion
  // the guard is there to refuse.
  it('allows the hover when the target id is not a string, even though it would resolve', () => {
    const state: OrderingState<TestInstance> = {
      order: { 7: ['a#0'], rail: ['a#1'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'a#1': { key: 'a#1', animeId: 'a', label: 'Anime A' },
      },
      duplicateAllowedDestinations: ['rail'],
    };
    const event = { operation: { source: { id: 'a#1' }, target: { id: 7 } } } as Parameters<
      typeof shouldBlockDuplicateHover
    >[1];

    expect(shouldBlockDuplicateHover(state, event)).toBe(false);
  });

  // The dragged id must be unknown. With a known card the unresolved target
  // yields an empty duplicate scan and the answer is `false` either way.
  it('allows the hover when the target belongs to no container, even for an unknown card', () => {
    expect(shouldBlockDuplicateHover(buildState(), dragOver('ghost#0', 'nowhere'))).toBe(false);
  });

  // dnd-kit reports a drag-over with no source or no target while a drag is
  // being cancelled, so both sides have to be read defensively.
  it('allows the hover when the operation carries no source', () => {
    const event = { operation: { target: { id: 'monday' } } } as Parameters<typeof shouldBlockDuplicateHover>[1];

    expect(shouldBlockDuplicateHover(buildState(), event)).toBe(false);
  });

  it('allows the hover when the operation carries no target', () => {
    const event = { operation: { source: { id: 'b#0' } } } as Parameters<typeof shouldBlockDuplicateHover>[1];

    expect(shouldBlockDuplicateHover(buildState(), event)).toBe(false);
  });

  it('blocks a hover whose dragged id is not a known card, since its anime cannot be checked', () => {
    expect(shouldBlockDuplicateHover(buildState(), dragOver('unknown#0', 'monday'))).toBe(true);
  });
});

describe('applyOrdering', () => {
  it('accepts an order with no duplicate anime in an exclusive container', () => {
    const next = applyOrdering(buildState(), { monday: [], rail: ['b#0', 'a#0'] });

    expect(next.order.rail).toEqual(['b#0', 'a#0']);
  });

  it('rejects the whole projection when it duplicates an anime, returning the state unchanged', () => {
    const state: OrderingState<TestInstance> = {
      order: { monday: ['a#0'], rail: ['a#1'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'a#1': { key: 'a#1', animeId: 'a', label: 'Anime A' },
      },
      duplicateAllowedDestinations: ['rail'],
    };

    expect(applyOrdering(state, { monday: ['a#0', 'a#1'], rail: [] })).toBe(state);
  });

  it('accepts the same anime twice inside a wildcard container', () => {
    const state: OrderingState<TestInstance> = {
      order: { monday: ['a#0'], rail: ['a#1'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'a#1': { key: 'a#1', animeId: 'a', label: 'Anime A' },
      },
      duplicateAllowedDestinations: ['rail'],
    };

    expect(applyOrdering(state, { monday: [], rail: ['a#0', 'a#1'] }).order.rail).toEqual(['a#0', 'a#1']);
  });
});

describe('duplicateOrderingCard', () => {
  it('adds a clone into the first wildcard container', () => {
    const next = duplicateOrderingCard(buildState(), 'a');

    expect(next.order.rail).toEqual(['b#0', 'a#1']);
    expect(next.instances['a#1'].label).toBe('Anime A');
  });

  it('returns the state unchanged for an unknown anime', () => {
    const state = buildState();

    expect(duplicateOrderingCard(state, 'zzz')).toBe(state);
  });

  it('materializes the wildcard container when the order has no bucket for it yet', () => {
    const state: OrderingState<TestInstance> = {
      order: { monday: ['a#0'] },
      instances: { 'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' } },
      duplicateAllowedDestinations: ['rail'],
    };

    expect(duplicateOrderingCard(state, 'a').order.rail).toEqual(['a#1']);
  });
});

describe('removeOrderingCard', () => {
  it('removes a card when the anime keeps at least one placement', () => {
    const state: OrderingState<TestInstance> = {
      order: { monday: ['a#0'], rail: ['a#1'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'a#1': { key: 'a#1', animeId: 'a', label: 'Anime A' },
      },
    };
    const next = removeOrderingCard(state, 'a#1');

    expect(next.order.rail).toEqual([]);
    expect(next.instances['a#1']).toBeUndefined();
  });

  it('refuses to remove an anime last card', () => {
    const state = buildState();

    expect(removeOrderingCard(state, 'a#0')).toBe(state);
  });
});

describe('moveOrderingCard', () => {
  it('moves an anime into the requested slot', () => {
    const next = moveOrderingCard(buildState(), { animeId: 'b', destinationId: 'monday', order: 1 });

    expect(next.order.monday).toEqual(['b#0', 'a#0']);
    expect(next.order.rail).toEqual([]);
  });

  it('clamps an order beyond the container length to the end', () => {
    const next = moveOrderingCard(buildState(), { animeId: 'b', destinationId: 'monday', order: 99 });

    expect(next.order.monday).toEqual(['a#0', 'b#0']);
  });

  it('returns the state unchanged for an unknown destination', () => {
    const state = buildState();

    expect(moveOrderingCard(state, { animeId: 'b', destinationId: 'nope', order: 1 })).toBe(state);
  });

  it('returns the state unchanged for an unknown anime', () => {
    const state = buildState();

    expect(moveOrderingCard(state, { animeId: 'zzz', destinationId: 'monday', order: 1 })).toBe(state);
  });
});
