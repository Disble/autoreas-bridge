import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BRIDGE_SEASON_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
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
  const { rerender } = renderHook((props: ResolverProps) => useIntakeDiscardResolver(props.push, props.remove), { initialProps: { push, remove }, wrapper: seasonQueryWrapper().wrapper });
  return { push, remove, rerender };
}

describe('useIntakeDiscardResolver', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.restoreAllMocks();
  });

  it('pushes nothing until a discard succeeds', () => {
    const { push } = renderResolver();

    expect(push).not.toHaveBeenCalled();
  });

  it('pushes one Undo toast per successful discard, and Undo restores that row and closes its toast', async () => {
    const restoreName = vi.spyOn(BRIDGE_SEASON_SOURCE, 'restoreName').mockResolvedValue('ok');
    vi.spyOn(BRIDGE_SEASON_SOURCE, 'readSeasonAnimes').mockResolvedValue([]);
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
    await waitFor(() => expect(restoreName).toHaveBeenCalledExactlyOnceWith('sa-1'));
    await waitFor(() => expect(BRIDGE_SEASON_SOURCE.readSeasonAnimes).toHaveBeenCalled());
    expect(remove).toHaveBeenCalledExactlyOnceWith('intake-discard-1');

    act(() => {
      setSeasonStoreState({ lastDiscard: { rowId: 'sa-2', rawName: 'Kaiju', sequence: 2 } });
    });
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[1][0]).toMatchObject({ description: 'Kaiju', dedupeKey: 'intake-discard-2' });
    expect(getSeasonStoreState().lastDiscard?.sequence).toBe(2);
  });

  it('waits for restore and its row refresh before closing the toast', async () => {
    let release: (value: string) => void = () => undefined;
    vi.spyOn(BRIDGE_SEASON_SOURCE, 'restoreName').mockReturnValue(new Promise((resolve) => { release = resolve; }));
    vi.spyOn(BRIDGE_SEASON_SOURCE, 'readSeasonAnimes').mockResolvedValue([]);
    const { push, remove } = renderResolver();
    act(() => setSeasonStoreState({ lastDiscard: { rowId: 'sa-1', rawName: 'Name', sequence: 1 } }));
    act(() => push.mock.calls[0][0].actions?.[0].onPress());
    expect(remove).not.toHaveBeenCalled();
    await act(async () => { release('ok'); });
    await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('intake-discard-1'));
    expect(BRIDGE_SEASON_SOURCE.readSeasonAnimes).toHaveBeenCalled();
  });

  it('pushes and closes through the latest callbacks it was handed', async () => {
    const { push, rerender } = renderResolver();
    const nextPush = vi.fn<(notification: AppNotification) => void>();
    const nextRemove = vi.fn<(key: string | number) => void>();
    vi.spyOn(BRIDGE_SEASON_SOURCE, 'restoreName').mockResolvedValue('ok');
    vi.spyOn(BRIDGE_SEASON_SOURCE, 'readSeasonAnimes').mockResolvedValue([]);

    rerender({ push: nextPush, remove: nextRemove });
    act(() => {
      setSeasonStoreState({ lastDiscard: { rowId: 'sa-1', rawName: 'Dr. Stone', sequence: 1 } });
    });
    act(() => {
      nextPush.mock.calls[0][0].actions?.[0].onPress();
    });

    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(nextRemove).toHaveBeenCalledExactlyOnceWith('intake-discard-1'));
  });
});
