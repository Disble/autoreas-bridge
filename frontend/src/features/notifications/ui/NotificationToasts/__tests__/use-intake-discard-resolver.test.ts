import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { seasonSource } from '../../../../../infrastructure/season-source/season-source.helpers';
import type { AppNotification } from '../../../../../shared/contracts/app-notification.types';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useIntakeDiscardResolver } from '../use-intake-discard-resolver';

/** The push/remove callbacks the controller hands the resolver. */
interface ResolverProps {
  /** The push spy. */
  readonly push: (notification: AppNotification) => void;
  /** The remove spy. */
  readonly remove: (key: string | number) => void;
}

/**
 * Mounts the resolver with push/remove spies over the real season store.
 * @returns The spies the resolver drives and the harness rerender.
 */
function renderResolver() {
  const push = vi.fn<(notification: AppNotification) => void>();
  const remove = vi.fn<(key: string | number) => void>();
  const { rerender } = renderHook((props: ResolverProps) => useIntakeDiscardResolver(props.push, props.remove), { initialProps: { push, remove } });
  return { push, remove, rerender };
}

describe('useIntakeDiscardResolver', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('pushes nothing until a discard succeeds', () => {
    const { push } = renderResolver();

    expect(push).not.toHaveBeenCalled();
  });

  it('pushes one Undo toast per successful discard, and Undo restores that row and closes its toast', () => {
    const restoreName = vi.fn().mockResolvedValue(true);
    setSeasonStoreState({ restoreName });
    const { push, remove } = renderResolver();

    act(() => {
      setSeasonStoreState({ lastDiscard: { rowId: 'sa-1', rawName: 'Dr. Stone', sequence: 1 } });
    });

    expect(push).toHaveBeenCalledExactlyOnceWith({
      severity: 'info',
      title: 'Discarded',
      description: 'Dr. Stone',
      actions: [{ label: 'Undo', onPress: expect.any(Function) }],
      dedupeKey: 'intake-discard-1',
    });
    act(() => {
      push.mock.calls[0][0].actions?.[0].onPress();
    });
    expect(restoreName).toHaveBeenCalledExactlyOnceWith(seasonSource, 'sa-1');
    expect(remove).toHaveBeenCalledExactlyOnceWith('intake-discard-1');

    act(() => {
      setSeasonStoreState({ lastDiscard: { rowId: 'sa-2', rawName: 'Kaiju', sequence: 2 } });
    });
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[1][0]).toMatchObject({ description: 'Kaiju', dedupeKey: 'intake-discard-2' });
    expect(getSeasonStoreState().lastDiscard?.sequence).toBe(2);
  });

  it('pushes and closes through the latest callbacks it was handed', () => {
    const { push, rerender } = renderResolver();
    const nextPush = vi.fn<(notification: AppNotification) => void>();
    const nextRemove = vi.fn<(key: string | number) => void>();
    setSeasonStoreState({ restoreName: vi.fn().mockResolvedValue(true) });

    rerender({ push: nextPush, remove: nextRemove });
    act(() => {
      setSeasonStoreState({ lastDiscard: { rowId: 'sa-1', rawName: 'Dr. Stone', sequence: 1 } });
    });
    act(() => {
      nextPush.mock.calls[0][0].actions?.[0].onPress();
    });

    expect(push).not.toHaveBeenCalled();
    expect(nextRemove).toHaveBeenCalledExactlyOnceWith('intake-discard-1');
  });
});
