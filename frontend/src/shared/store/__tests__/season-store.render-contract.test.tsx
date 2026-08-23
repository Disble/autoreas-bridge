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
      useSeasonStore((state) => state.seasonAnimes);
      useSeasonStore((state) => state.readOnly);
      useSeasonStore((state) => state.hasLoaded);
      useSeasonStore((state) => state.pastSeasons);
    });

    expect(rerenders).toBe(0);
  });

  it('does not re-render one useShallow object selector on an unrelated write', () => {
    const rerenders = countRerendersOnUnrelatedWrite(() =>
      useSeasonStore(
        useShallow((state) => ({
          seasonAnimes: state.seasonAnimes,
          readOnly: state.readOnly,
          hasLoaded: state.hasLoaded,
          pastSeasons: state.pastSeasons,
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
                seasonAnimes: state.seasonAnimes,
                readOnly: state.readOnly,
                hasLoaded: state.hasLoaded,
                pastSeasons: state.pastSeasons,
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

  it('keeps every action reference stable across a state write', () => {
    const before = getSeasonStoreState();

    setSeasonStoreState({ busyMessage: 'working', hasLoaded: true });

    const after = getSeasonStoreState();
    const actions = Object.keys(before).filter(
      (key) => typeof before[key as keyof typeof before] === 'function',
    );

    expect(actions.length).toBeGreaterThan(0);
    for (const name of actions) {
      expect(after[name as keyof typeof after]).toBe(before[name as keyof typeof before]);
    }
  });

  it('keeps every action reference stable across resetSeasonStore', () => {
    const before = getSeasonStoreState();

    resetSeasonStore();

    const after = getSeasonStoreState();
    for (const name of Object.keys(before)) {
      if (typeof before[name as keyof typeof before] !== 'function') {
        continue;
      }
      expect(after[name as keyof typeof after]).toBe(before[name as keyof typeof before]);
    }
  });
});
