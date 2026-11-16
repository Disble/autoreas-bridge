import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { getSeasonStoreState, resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { deferred, makeSeasonPort } from '../../../__tests__/season-port.test-support';
import { useSelectionBoard } from '../use-selection-board';

/** What the board hook returns, as the rule cases read it. */
type BoardApi = ReturnType<typeof useSelectionBoard>;

/** One selection rule: the port it writes, the value it exposes, and its numbers. */
interface RuleCase {
  /** The optimistic setter the screen calls. */
  readonly setter: 'onSetMinApprovalGrade' | 'onSetSlots';
  /** The port the setter writes through. */
  readonly port: 'setMinApprovalGrade' | 'setSlots';
  /** Reads the rule's currently shown value. */
  readonly value: (api: BoardApi) => number | undefined;
  /** The number a case writes first and a late failure must not restore. */
  readonly next: number;
  /** A newer number written while the first write is still in flight. */
  readonly newer: number;
  /** The number the season snapshot already holds. */
  readonly initial: number;
}

/** Both selection rules, so every case runs against the two of them. */
const RULES: readonly RuleCase[] = [
  { setter: 'onSetMinApprovalGrade', port: 'setMinApprovalGrade', value: (api) => api.minApprovalGrade, next: 5, newer: 6, initial: 4 },
  { setter: 'onSetSlots', port: 'setSlots', value: (api) => api.slots, next: 20, newer: 30, initial: 12 },
];

/** Mounts the board over a ready season query client. */
function renderBoard(source: ReturnType<typeof makeSeasonPort>) {
  return renderHook(() => useSelectionBoard(source, { getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }) }), {
    wrapper: createModulesTestWrapper({ module: 'season', state: 'ready' }).wrapper,
  });
}

/** Mounts the board and waits until the season snapshot it edits against is loaded. */
async function renderLoadedBoard(source: ReturnType<typeof makeSeasonPort>) {
  const rendered = renderBoard(source);
  await waitFor(() => expect(rendered.result.current.seasonName).toBe('Julio 2026'));
  return rendered;
}

describe('Selection board optimistic rules', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it.each(RULES)('shows a new $port at once and keeps it on success without re-reading the season', async (rule) => {
    const write = deferred<string>();
    const source = makeSeasonPort({ [rule.port]: vi.fn().mockReturnValue(write.promise) });
    const { result } = await renderLoadedBoard(source);

    act(() => result.current[rule.setter](rule.next));
    expect(rule.value(result.current)).toBe(rule.next);

    await act(async () => {
      write.resolve('ok');
      await write.promise;
    });

    await waitFor(() => expect(rule.value(result.current)).toBe(rule.next));
    expect(getSeasonStoreState().errorMessage).toBeUndefined();
    expect(source.readSeason).toHaveBeenCalledTimes(1);
    expect(source.readSeasonAnimes).toHaveBeenCalledTimes(1);
  });

  it.each(RULES)('rolls a failed $port back to the previous value and reports it', async (rule) => {
    const write = deferred<string>();
    const source = makeSeasonPort({ [rule.port]: vi.fn().mockReturnValue(write.promise) });
    const { result } = await renderLoadedBoard(source);
    expect(rule.value(result.current)).toBe(rule.initial);

    act(() => result.current[rule.setter](rule.next));
    await act(async () => {
      write.reject(createBridgeError('internal', 'rule write failed'));
      await write.promise.catch(() => undefined);
    });

    await waitFor(() => expect(rule.value(result.current)).toBe(rule.initial));
    expect(getSeasonStoreState().errorMessage).toBe('rule write failed');
  });

  it.each(RULES)('keeps the newer $port when an older write fails after it', async (rule) => {
    const stale = deferred<string>();
    const fresh = deferred<string>();
    const source = makeSeasonPort({ [rule.port]: vi.fn().mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise) });
    const { result } = await renderLoadedBoard(source);

    act(() => result.current[rule.setter](rule.next));
    act(() => result.current[rule.setter](rule.newer));
    expect(rule.value(result.current)).toBe(rule.newer);

    await act(async () => {
      stale.reject(createBridgeError('internal', 'stale rule write'));
      await stale.promise.catch(() => undefined);
    });

    await waitFor(() => expect(rule.value(result.current)).toBe(rule.newer));
    await act(async () => {
      fresh.resolve('ok');
      await fresh.promise;
    });

    expect(rule.value(result.current)).toBe(rule.newer);
  });
});
