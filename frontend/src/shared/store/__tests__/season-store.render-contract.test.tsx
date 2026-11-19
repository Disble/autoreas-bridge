import { render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShallow } from 'zustand/react/shallow';

import { useSeasonStore } from '../season-store/season-store';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../season-store/season-store.helpers';

/**
 * Renders `subscribe` and returns how many times it ran while a store write
 * that touches none of its selected fields is applied. Zero means the
 * subscription shape is precise; above zero means it wakes on unrelated state.
 */
function countRerendersOnUnrelatedWrite(subscribe: () => unknown): number {
  let renders = 0;

  function Probe(): null {
    renders += 1;
    subscribe();
    return null;
  }

  render(<Probe />);
  const initial = renders;

  act(() => {
    setSeasonStoreState({ busyMessage: 'unrelated write' });
  });

  return renders - initial;
}

describe('season store subscription shape', () => {
  beforeEach(() => {
    resetSeasonStore();
    setSeasonStoreState({ busyMessage: undefined });
  });

  it('does not re-render four separate primitive selectors on an unrelated write', () => {
    const rerenders = countRerendersOnUnrelatedWrite(() => {
      useSeasonStore((state) => state.viewSeasonId);
      useSeasonStore((state) => state.readOnly);
      useSeasonStore((state) => state.lastDiscard);
      useSeasonStore((state) => state.matchingRun);
    });

    expect(rerenders).toBe(0);
  });

  it('does not re-render one useShallow object selector on an unrelated write', () => {
    const rerenders = countRerendersOnUnrelatedWrite(() =>
      useSeasonStore(
        useShallow((state) => ({
          viewSeasonId: state.viewSeasonId,
          readOnly: state.readOnly,
          lastDiscard: state.lastDiscard,
          matchingRun: state.matchingRun,
        })),
      ),
    );

    expect(rerenders).toBe(0);
  });

  describe('the same object selector without useShallow', () => {
    beforeEach(() => {
      // React logs the "getSnapshot should be cached" warning before it throws.
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('does not merely re-render more — it fails to mount at all', () => {
      expect(() =>
        render(
          <Probe
            subscribe={() =>
              useSeasonStore((state) => ({
                viewSeasonId: state.viewSeasonId,
                readOnly: state.readOnly,
                lastDiscard: state.lastDiscard,
                matchingRun: state.matchingRun,
              }))
            }
          />,
        ),
      ).toThrow();
    });
  });
});

/**
 * Probe whose subscription is supplied per test, so the failing case can be
 * rendered inside `expect(...).toThrow()` instead of at describe level.
 */
function Probe({ subscribe }: Readonly<{ subscribe: () => unknown }>): null {
  subscribe();
  return null;
}

describe('season store action identity', () => {
  beforeEach(() => {
    resetSeasonStore();
  });

  it('keeps every action reference stable across a state write and then across resetSeasonStore', () => {
    const before = getSeasonStoreState();
    const actions = Object.keys(before).filter(
      (key) => typeof before[key as keyof typeof before] === 'function',
    );

    setSeasonStoreState({ busyMessage: 'working', readOnly: true });

    const afterWrite = getSeasonStoreState();
    expect(actions.length).toBeGreaterThan(0);
    for (const name of actions) {
      expect(afterWrite[name as keyof typeof afterWrite]).toBe(before[name as keyof typeof before]);
    }

    resetSeasonStore();

    const afterReset = getSeasonStoreState();
    for (const name of actions) {
      expect(afterReset[name as keyof typeof afterReset]).toBe(before[name as keyof typeof before]);
    }
  });
});
