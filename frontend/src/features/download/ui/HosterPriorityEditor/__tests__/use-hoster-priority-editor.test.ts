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
  it('starts in the loading status, then loads hoster priority items from getDownloadConfig', async () => {
    const source = createSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });

    expect(result.current.status).toBe('loading');
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

  it('saves a reorder optimistically, then rereads the config', async () => {
    let resolvePersist: (() => void) | undefined;
    const getDownloadConfig = vi.fn().mockResolvedValue(baseConfig);
    const source = createSource({
      getDownloadConfig,
      setHosterPriority: vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolvePersist = () => resolve('ok');
          }),
      ),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getDownloadConfig).toHaveBeenCalledTimes(1);

    let reorderPromise!: Promise<void>;
    act(() => {
      reorderPromise = result.current.reorder(['mediafire', 'mega']);
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));
    expect(result.current.items.map((item) => item.hoster)).toEqual(['mediafire', 'mega']);

    await act(async () => {
      resolvePersist?.();
      await reorderPromise;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.items.map((item) => item.hoster)).toEqual(['mediafire', 'mega']);
    expect(source.setHosterPriority).toHaveBeenCalledWith('jkanime', [
      { hoster: 'mediafire', priority: 0, enabled: true },
      { hoster: 'mega', priority: 1, enabled: true },
    ]);
    expect(getDownloadConfig).toHaveBeenCalledTimes(2);
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

  it('rolls back to the previous order, surfaces an error and reads nothing again when persistence fails', async () => {
    const getDownloadConfig = vi.fn().mockResolvedValue(baseConfig);
    const source = createSource({
      getDownloadConfig,
      setHosterPriority: vi.fn().mockRejectedValue(new Error('network down')),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getDownloadConfig).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.reorder(['mediafire', 'mega']);
    });

    expect(result.current.items.map((item) => item.hoster)).toEqual(['mega', 'mediafire']);
    expect(result.current.status).toBe('error');
    expect(getDownloadConfig).toHaveBeenCalledTimes(1);
  });

  it('saves only a completed drag that changes the order', async () => {
    mockedMove.mockReturnValue(['mega', 'mediafire']);
    const source = createSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source), { wrapper: createDownloadsWrapper().wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.onDragEnd(dragEndEvent());
    });
    expect(source.setHosterPriority).not.toHaveBeenCalled();

    mockedMove.mockReturnValue(['mediafire', 'mega']);
    await act(async () => {
      await result.current.onDragEnd(dragEndEvent(true));
    });
    expect(source.setHosterPriority).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.onDragEnd(dragEndEvent());
    });

    expect(mockedMove).toHaveBeenLastCalledWith(['mega', 'mediafire'], expect.anything());
    expect(result.current.items.map((item) => item.hoster)).toEqual(['mediafire', 'mega']);
    expect(source.setHosterPriority).toHaveBeenCalledTimes(1);
  });
});
