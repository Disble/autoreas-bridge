import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { move } from '@dnd-kit/helpers';
import { useHosterPriorityEditor } from '../use-hoster-priority-editor';
import type { DownloadConfig, DownloadsSource } from '../../../../../shared/contracts/download.types';
import { createDownloadsSourceFake, createDownloadsWrapper } from '../../../../../shared/hooks/use-missed-schedule-notice/__tests__/downloads.test-support';

/** Download config every case starts from, carrying the hoster list under edit. */
const baseConfig: DownloadConfig = {
  jd: {
    email: '',
    hasPassword: false,
    deviceName: '',
    exePathOverride: '',
    defaultDestDir: '',
    lastSeenStatus: 'unknown',
    lastSeenAtMs: 0,
  },
  schedule: {
    mode: 'manual',
    dailyTimeHHMM: '',
    enabled: false,
    lastRunAtMs: 0,
    lastRunStatus: '',
    nextRunAtMs: 0,
    running: false,
    enabledWeekdays: 127,
    missedNotice: undefined,
  },
  hosterPrioritySite: 'jkanime',
  hosterPriority: [
    { hoster: 'mega', priority: 0, enabled: true },
    { hoster: 'mediafire', priority: 1, enabled: true },
  ],
  renameEpisodes: false,
};

/**
 * Builds a fully stubbed downloads port, overridable per case.
 * @param overrides The calls a case replaces.
 * @returns The port.
 */
function createSource(overrides: Partial<DownloadsSource> = {}): DownloadsSource {
  return createDownloadsSourceFake({
    getDownloadConfig: vi.fn().mockResolvedValue(baseConfig),
    ...overrides,
  });
}

// `move` owns dnd-kit's index math; the hook only maps its result onto persistence.
// Real pointer drags are not exercisable under jsdom, so the boundary is mocked.
vi.mock('@dnd-kit/helpers', () => ({ move: vi.fn() }));

/** Typed handle on the mocked dnd-kit `move`, so a case can assert how a drag was applied. */
const mockedMove = vi.mocked(move);

/** Minimal structural stand-in for a dnd-kit `dragend` event. */
function dragEndEvent(canceled = false) {
  return { canceled, operation: { source: { id: 'mediafire' }, target: { id: 'mega' } } } as never;
}

describe('useHosterPriorityEditor', () => {
  it('starts in the loading status before the config resolves', () => {
    const source = createSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    expect(result.current.status).toBe('loading');
  });

  it('loads hoster priority items from getDownloadConfig', async () => {
    const source = createSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.items.map((item) => item.hoster)).toEqual(['mega', 'mediafire']);
  });

  it('reports the "empty" status when no hosters are configured', async () => {
    const source = createSource({
      getDownloadConfig: vi.fn().mockResolvedValue({ ...baseConfig, hosterPriority: [] }),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('empty'));
  });

  it('reports the "error" status when getDownloadConfig rejects', async () => {
    const source = createSource({
      getDownloadConfig: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBeTruthy();
  });

  it.each([['success', false, 2], ['failure', true, 1]] as const)(
    'reads config the expected number of times after save %s',
    async (_outcome, fails, expectedReads) => {
      const getDownloadConfig = vi.fn().mockResolvedValue(baseConfig);
      const setHosterPriority = fails ? vi.fn().mockRejectedValue(new Error('save failed')) : vi.fn().mockResolvedValue(undefined);
      const source = createSource({ getDownloadConfig, setHosterPriority });
      const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });
      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(getDownloadConfig).toHaveBeenCalledTimes(1);

      await act(async () => { await result.current.reorder(['mediafire', 'mega']); });

      expect(getDownloadConfig).toHaveBeenCalledTimes(expectedReads);
    },
  );

  it('persists a reorder via setHosterPriority and reflects the optimistic order immediately', async () => {
    const source = createSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.reorder(['mediafire', 'mega']);
    });

    expect(result.current.items.map((item) => item.hoster)).toEqual(['mediafire', 'mega']);
    expect(source.setHosterPriority).toHaveBeenCalledWith('jkanime', [
      { hoster: 'mediafire', priority: 0, enabled: true },
      { hoster: 'mega', priority: 1, enabled: true },
    ]);
  });

  // The engine resolves hosters for the site the config was read from. Persisting
  // to a site name the editor picked itself is how a reorder silently became a
  // no-op: the write landed under "default" while the engine read "jkanime".
  it('persists back to the site the loaded config reported, not a hardcoded one', async () => {
    const source = createSource({
      getDownloadConfig: vi.fn().mockResolvedValue({ ...baseConfig, hosterPrioritySite: 'otheranime' }),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.reorder(['mediafire', 'mega']);
    });

    expect(source.setHosterPriority).toHaveBeenCalledWith('otheranime', expect.anything());
  });

  it('refuses to persist and surfaces an error when the config reported no site', async () => {
    const source = createSource({
      getDownloadConfig: vi.fn().mockResolvedValue({ ...baseConfig, hosterPrioritySite: '' }),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.reorder(['mediafire', 'mega']);
    });

    expect(source.setHosterPriority).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.items.map((item) => item.hoster)).toEqual(['mega', 'mediafire']);
  });

  it('rolls back to the previous order and surfaces an error when persistence fails', async () => {
    const source = createSource({
      setHosterPriority: vi.fn().mockRejectedValue(new Error('network down')),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.reorder(['mediafire', 'mega']);
    });

    expect(result.current.items.map((item) => item.hoster)).toEqual(['mega', 'mediafire']);
    expect(result.current.status).toBe('error');
  });

  it('exposes isSaving=true while a reorder request is in flight', async () => {
    let resolvePersist: (() => void) | undefined;
    const source = createSource({
      setHosterPriority: vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolvePersist = () => resolve('ok');
          }),
      ),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    let reorderPromise!: Promise<void>;
    act(() => {
      reorderPromise = result.current.reorder(['mediafire', 'mega']);
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));

    await act(async () => {
      resolvePersist?.();
      await reorderPromise;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });

  it('persists the key order that `move` projects for a completed drag', async () => {
    mockedMove.mockReturnValue(['mediafire', 'mega']);
    const source = createSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.onDragEnd(dragEndEvent());
    });

    expect(mockedMove).toHaveBeenCalledWith(['mega', 'mediafire'], expect.anything());
    expect(result.current.items.map((item) => item.hoster)).toEqual(['mediafire', 'mega']);
    expect(source.setHosterPriority).toHaveBeenCalledTimes(1);
  });

  it('does not persist when the drag was canceled', async () => {
    mockedMove.mockReturnValue(['mediafire', 'mega']);
    const source = createSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.onDragEnd(dragEndEvent(true));
    });

    expect(source.setHosterPriority).not.toHaveBeenCalled();
  });

  it('does not persist when the drag leaves the order unchanged', async () => {
    mockedMove.mockReturnValue(['mega', 'mediafire']);
    const source = createSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.onDragEnd(dragEndEvent());
    });

    expect(source.setHosterPriority).not.toHaveBeenCalled();
  });
});
