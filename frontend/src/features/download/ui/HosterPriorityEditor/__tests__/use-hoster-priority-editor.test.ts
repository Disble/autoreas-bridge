import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { move } from '@dnd-kit/helpers';
import { useHosterPriorityEditor } from '../use-hoster-priority-editor';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { DownloadConfig } from '../../../../../shared/contracts/download.types';

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
};

function createFakeSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn().mockResolvedValue(baseConfig),
    getJDStatus: vi.fn(),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn(),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn().mockResolvedValue('ok'),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    listDownloadRuns: vi.fn(),
    listDownloadReadiness: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

// `move` owns dnd-kit's index math; the hook only maps its result onto persistence.
// Real pointer drags are not exercisable under jsdom, so the boundary is mocked.
vi.mock('@dnd-kit/helpers', () => ({ move: vi.fn() }));

const mockedMove = vi.mocked(move);

/** Minimal structural stand-in for a dnd-kit `dragend` event. */
function dragEndEvent(canceled = false) {
  return { canceled, operation: { source: { id: 'mediafire' }, target: { id: 'mega' } } } as never;
}

describe('useHosterPriorityEditor', () => {
  it('starts in the loading status before the config resolves', () => {
    const source = createFakeSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source));

    expect(result.current.status).toBe('loading');
  });

  it('loads hoster priority items from getDownloadConfig', async () => {
    const source = createFakeSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.items.map((item) => item.hoster)).toEqual(['mega', 'mediafire']);
  });

  it('reports the "empty" status when no hosters are configured', async () => {
    const source = createFakeSource({
      getDownloadConfig: vi.fn().mockResolvedValue({ ...baseConfig, hosterPriority: [] }),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source));

    await waitFor(() => expect(result.current.status).toBe('empty'));
  });

  it('reports the "error" status when getDownloadConfig rejects', async () => {
    const source = createFakeSource({
      getDownloadConfig: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBeTruthy();
  });

  it('persists a reorder via setHosterPriority and reflects the optimistic order immediately', async () => {
    const source = createFakeSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source));

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
    const source = createFakeSource({
      getDownloadConfig: vi.fn().mockResolvedValue({ ...baseConfig, hosterPrioritySite: 'otheranime' }),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.reorder(['mediafire', 'mega']);
    });

    expect(source.setHosterPriority).toHaveBeenCalledWith('otheranime', expect.anything());
  });

  it('refuses to persist and surfaces an error when the config reported no site', async () => {
    const source = createFakeSource({
      getDownloadConfig: vi.fn().mockResolvedValue({ ...baseConfig, hosterPrioritySite: '' }),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.reorder(['mediafire', 'mega']);
    });

    expect(source.setHosterPriority).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.items.map((item) => item.hoster)).toEqual(['mega', 'mediafire']);
  });

  it('rolls back to the previous order and surfaces an error when persistence fails', async () => {
    const source = createFakeSource({
      setHosterPriority: vi.fn().mockRejectedValue(new Error('network down')),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.reorder(['mediafire', 'mega']);
    });

    expect(result.current.items.map((item) => item.hoster)).toEqual(['mega', 'mediafire']);
    expect(result.current.status).toBe('error');
  });

  it('exposes isSaving=true while a reorder request is in flight', async () => {
    let resolvePersist: (() => void) | undefined;
    const source = createFakeSource({
      setHosterPriority: vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolvePersist = () => resolve('ok');
          }),
      ),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source));

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

    expect(result.current.isSaving).toBe(false);
  });

  it('persists the key order that `move` projects for a completed drag', async () => {
    mockedMove.mockReturnValue(['mediafire', 'mega']);
    const source = createFakeSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source));

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
    const source = createFakeSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.onDragEnd(dragEndEvent(true));
    });

    expect(source.setHosterPriority).not.toHaveBeenCalled();
  });

  it('does not persist when the drag leaves the order unchanged', async () => {
    mockedMove.mockReturnValue(['mega', 'mediafire']);
    const source = createFakeSource();
    const { result } = renderHook(() => useHosterPriorityEditor(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.onDragEnd(dragEndEvent());
    });

    expect(source.setHosterPriority).not.toHaveBeenCalled();
  });
});
