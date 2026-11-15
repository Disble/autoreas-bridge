import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DevicesSource } from '../../../../../shared/contracts/devices.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import type { SyncingAnime } from '../../../../../shared/contracts/syncing-anime.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createReadinessGate } from '../../../../../shared/query/readiness-gate/readiness-gate.helpers';
import { createBridgeQueryTestWrapper } from '../../../../../shared/query/test-support/bridge-query.test-support';
import { staticSource, status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { useSyncingAnimePanel } from '../use-syncing-anime-panel';

/** One pending anime sync as the binding answers it. */
const DUNGEON_MESHI: SyncingAnime = {
  animeId: 'anime-7',
  title: 'Dungeon Meshi',
  changeType: 'update',
  pendingChanges: 2,
  changedFields: ['nrocapvisto'],
  progressCurrent: 18,
  progressTotal: 24,
  lastChangedAtMs: Date.UTC(2026, 5, 20, 18, 15, 0),
  active: 1,
};

/**
 * Renders the hook under a query wrapper whose readiness gate reports the sync module.
 * @param source The pending-queue port.
 * @param sync The sync module's readiness.
 * @returns The hook render, its rerender, and the readiness `emit` control.
 */
function renderPanel(source: Pick<DevicesSource, 'getSyncingAnimeItems'>, sync: ModuleReadiness = status('sync', 'ready')) {
  const readiness = staticSource(sync);
  const { wrapper } = createBridgeQueryTestWrapper({ readinessGate: createReadinessGate(readiness.source) });
  const rendered = renderHook(({ refreshToken }) => useSyncingAnimePanel({ refreshToken }, source), { initialProps: { refreshToken: 0 }, wrapper });
  return { ...rendered, emit: readiness.emit };
}

describe('useSyncingAnimePanel', () => {
  it('stays loading without reading the queue while the sync module starts, then shows the items once ready', async () => {
    const source = { getSyncingAnimeItems: vi.fn().mockResolvedValue([DUNGEON_MESHI]) };
    const { result, emit } = renderPanel(source, status('sync', 'starting'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current.view.kind).toBe('loading');
    expect(source.getSyncingAnimeItems).not.toHaveBeenCalled();

    act(() => emit(status('sync', 'ready')));

    await waitFor(() => expect(result.current.view.kind).toBe('ready'));
    const { view } = result.current;
    expect(view.kind === 'ready' && view.data.map((item) => item.title)).toEqual(['Dungeon Meshi']);
  });

  it('is empty, not loading, once an empty queue resolves', async () => {
    const { result } = renderPanel({ getSyncingAnimeItems: vi.fn().mockResolvedValue([]) });

    await waitFor(() => expect(result.current.view.kind).toBe('empty'));
  });

  it.each([
    ['the sync module failed', status('sync', 'failed', 'sync: database locked'), vi.fn(), 'sync: database locked'],
    ['the read rejects', status('sync', 'ready'), vi.fn().mockRejectedValue(createBridgeError('internal', 'pending read failed')), 'pending read failed'],
  ])('shows the failure, never an empty queue, when %s', async (_case, sync, getSyncingAnimeItems, message) => {
    const { result } = renderPanel({ getSyncingAnimeItems }, sync);

    await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'failure', message }));
  });

  it('re-reads the queue when the refresh token changes, loading instead of showing the superseded items', async () => {
    let answerSecondRead: (items: readonly SyncingAnime[]) => void = () => undefined;
    const getSyncingAnimeItems = vi
      .fn()
      .mockResolvedValueOnce([DUNGEON_MESHI])
      .mockReturnValueOnce(new Promise((resolve) => (answerSecondRead = resolve)));
    const { result, rerender } = renderPanel({ getSyncingAnimeItems });
    await waitFor(() => expect(result.current.view.kind).toBe('ready'));

    rerender({ refreshToken: 1 });

    await waitFor(() => expect(getSyncingAnimeItems).toHaveBeenCalledTimes(2));
    expect(result.current.view.kind).toBe('loading');
    await act(async () => answerSecondRead([{ ...DUNGEON_MESHI, title: 'Frieren' }]));
    await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'ready', data: [{ title: 'Frieren' }] }));
  });
});
