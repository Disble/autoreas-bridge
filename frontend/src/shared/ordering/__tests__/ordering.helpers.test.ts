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

/**
 * Builds a board holding anime `a` twice: `a#0` on exclusive monday, `a#1` on the wildcard rail.
 * @returns A state where moving `a#1` onto monday would duplicate `a`.
 */
function buildDuplicatedState(): OrderingState<TestInstance> {
  return {
    order: { monday: ['a#0'], rail: ['a#1'] },
    instances: {
      'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
      'a#1': { key: 'a#1', animeId: 'a', label: 'Anime A' },
    },
    duplicateAllowedDestinations: ['rail'],
  };
}

/**
 * Builds a drag-over event from raw ids, for the defensive non-string and missing-side cases.
 * @param operation The operation's source and target as dnd-kit may report them.
 * @returns An event shaped like the fields the guard reads.
 */
function rawDragOver(operation: object) {
  return { operation } as Parameters<typeof shouldBlockDuplicateHover>[1];
}

describe('nextInstanceKey', () => {
  it('starts at index 0 and skips indexes already taken so keys stay unique', () => {
    const instances = {
      'a#0': { key: 'a#0', animeId: 'a', label: 'x' },
      'a#1': { key: 'a#1', animeId: 'a', label: 'x' },
    };

    expect.soft(nextInstanceKey({}, 'a'), 'anime with no cards').toBe('a#0');
    expect.soft(nextInstanceKey(instances, 'a'), 'indexes 0 and 1 taken').toBe('a#2');
  });
});

describe('resolveContainerOf', () => {
  it('resolves a container id to itself, a card id to its container and anything else to undefined', () => {
    expect.soft(resolveContainerOf(buildState(), 'monday'), 'container id').toBe('monday');
    expect.soft(resolveContainerOf(buildState(), 'b#0'), 'card id').toBe('rail');
    expect.soft(resolveContainerOf(buildState(), 'nope'), 'neither').toBeUndefined();
  });
});

describe('findKeyForAnime', () => {
  it('finds the first card of an anime, skipping dangling keys, and undefined when it has none', () => {
    const dangling: OrderingState<TestInstance> = {
      order: { monday: ['ghost#0', 'a#0'] },
      instances: { 'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' } },
    };

    expect.soft(findKeyForAnime(buildState(), 'b'), 'anime with a card').toBe('b#0');
    expect.soft(findKeyForAnime(buildState(), 'zzz'), 'anime with no card').toBeUndefined();
    expect.soft(findKeyForAnime(dangling, 'a'), 'dangling key in the order').toBe('a#0');
  });
});

describe('getInstancesIn', () => {
  it('returns a container\'s ordered instances and an empty list for an unknown container', () => {
    expect.soft(getInstancesIn(buildState(), 'monday').map((instance) => instance.label), 'known container').toEqual(['Anime A']);
    expect.soft(getInstancesIn(buildState(), 'nope'), 'unknown container').toEqual([]);
  });
});

describe('shouldBlockDuplicateHover', () => {
  it('blocks only a hover that would duplicate an anime in an exclusive container, or an unknown card', () => {
    const noWildcard: OrderingState<TestInstance> = {
      order: { monday: ['a#0'], rail: ['b#0'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'b#0': { key: 'b#0', animeId: 'b', label: 'Anime B' },
      },
    };
    const danglingKey: OrderingState<TestInstance> = {
      order: { monday: ['ghost#9'], rail: ['b#0'] },
      instances: { 'b#0': { key: 'b#0', animeId: 'b', label: 'Anime B' } },
      duplicateAllowedDestinations: ['rail'],
    };
    const duplicateAmongSeveral: OrderingState<TestInstance> = {
      order: { monday: ['b#0', 'a#0'], rail: ['a#1'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'a#1': { key: 'a#1', animeId: 'a', label: 'Anime A' },
        'b#0': { key: 'b#0', animeId: 'b', label: 'Anime B' },
      },
      duplicateAllowedDestinations: ['rail'],
    };
    // A numeric object key resolves through `Object.hasOwn`, exactly the coercion the
    // target `typeof` guard refuses; against an unresolvable target the guard is invisible.
    const numericContainer: OrderingState<TestInstance> = { ...buildDuplicatedState(), order: { 7: ['a#0'], rail: ['a#1'] } };
    const cases: ReadonlyArray<readonly [string, OrderingState<TestInstance>, Parameters<typeof shouldBlockDuplicateHover>[1], boolean]> = [
      ['same anime twice in an exclusive container', buildDuplicatedState(), dragOver('a#1', 'monday'), true],
      // The wildcard must already HOLD a card of the same anime, or the duplicate scan finds nothing anyway.
      ['wildcard target that already holds that anime', buildDuplicatedState(), dragOver('a#0', 'rail'), false],
      ['the container the card already sits in', buildState(), dragOver('a#0', 'monday'), false],
      ['no container declared a wildcard', noWildcard, dragOver('b#0', 'monday'), false],
      ['dangling key no instance backs', danglingKey, dragOver('b#0', 'monday'), false],
      ['hover that introduces no duplicate', buildState(), dragOver('b#0', 'monday'), false],
      ['duplicate among several cards', duplicateAmongSeveral, dragOver('a#1', 'monday'), true],
      ['dragged id is not a string', buildState(), rawDragOver({ source: { id: 7 }, target: { id: 'monday' } }), false],
      ['target id is not a string, though it would resolve', numericContainer, rawDragOver({ source: { id: 'a#1' }, target: { id: 7 } }), false],
      // The dragged id must be unknown: with a known card the unresolved target is `false` either way.
      ['target in no container, for an unknown card', buildState(), dragOver('ghost#0', 'nowhere'), false],
      // dnd-kit reports a drag-over with no source or no target while a drag is being cancelled.
      ['operation carries no source', buildState(), rawDragOver({ target: { id: 'monday' } }), false],
      ['operation carries no target', buildState(), rawDragOver({ source: { id: 'b#0' } }), false],
      ['dragged id is not a known card, so its anime cannot be checked', buildState(), dragOver('unknown#0', 'monday'), true],
    ];
    for (const [name, state, event, expected] of cases) {
      expect.soft(shouldBlockDuplicateHover(state, event), name).toBe(expected);
    }
  });
});

describe('applyOrdering', () => {
  it('accepts an order without an exclusive duplicate and rejects the whole projection otherwise', () => {
    const duplicated = buildDuplicatedState();

    expect.soft(applyOrdering(buildState(), { monday: [], rail: ['b#0', 'a#0'] }).order.rail, 'no duplicate').toEqual(['b#0', 'a#0']);
    expect.soft(applyOrdering(duplicated, { monday: ['a#0', 'a#1'], rail: [] }), 'exclusive duplicate returns the state').toBe(duplicated);
    expect
      .soft(applyOrdering(buildDuplicatedState(), { monday: [], rail: ['a#0', 'a#1'] }).order.rail, 'same anime twice in a wildcard')
      .toEqual(['a#0', 'a#1']);
  });
});

describe('duplicateOrderingCard', () => {
  it('clones a card into the first wildcard container, materializing it, and ignores an unknown anime', () => {
    const next = duplicateOrderingCard(buildState(), 'a');
    const state = buildState();
    const noRailBucket: OrderingState<TestInstance> = {
      order: { monday: ['a#0'] },
      instances: { 'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' } },
      duplicateAllowedDestinations: ['rail'],
    };

    expect.soft(next.order.rail, 'clone order').toEqual(['b#0', 'a#1']);
    expect.soft(next.instances['a#1'].label, 'clone instance').toBe('Anime A');
    expect.soft(duplicateOrderingCard(state, 'zzz'), 'unknown anime').toBe(state);
    expect.soft(duplicateOrderingCard(noRailBucket, 'a').order.rail, 'wildcard bucket missing').toEqual(['a#1']);
  });
});

describe('removeOrderingCard', () => {
  it('removes a card while the anime keeps a placement and refuses to remove its last card', () => {
    const twoPlacements: OrderingState<TestInstance> = {
      order: { monday: ['a#0'], rail: ['a#1'] },
      instances: {
        'a#0': { key: 'a#0', animeId: 'a', label: 'Anime A' },
        'a#1': { key: 'a#1', animeId: 'a', label: 'Anime A' },
      },
    };
    const next = removeOrderingCard(twoPlacements, 'a#1');
    const state = buildState();

    expect.soft(next.order.rail, 'removed from its container').toEqual([]);
    expect.soft(next.instances['a#1'], 'instance dropped').toBeUndefined();
    expect.soft(removeOrderingCard(state, 'a#0'), 'last card').toBe(state);
  });
});

describe('moveOrderingCard', () => {
  it('moves an anime into the requested slot, clamped to the end, and ignores unknown targets', () => {
    const moved = moveOrderingCard(buildState(), { animeId: 'b', destinationId: 'monday', order: 1 });
    const state = buildState();

    expect.soft(moved.order.monday, 'requested slot: destination').toEqual(['b#0', 'a#0']);
    expect.soft(moved.order.rail, 'requested slot: source').toEqual([]);
    expect
      .soft(moveOrderingCard(buildState(), { animeId: 'b', destinationId: 'monday', order: 99 }).order.monday, 'order beyond the length')
      .toEqual(['a#0', 'b#0']);
    expect.soft(moveOrderingCard(state, { animeId: 'b', destinationId: 'nope', order: 1 }), 'unknown destination').toBe(state);
    expect.soft(moveOrderingCard(state, { animeId: 'zzz', destinationId: 'monday', order: 1 }), 'unknown anime').toBe(state);
  });
});
