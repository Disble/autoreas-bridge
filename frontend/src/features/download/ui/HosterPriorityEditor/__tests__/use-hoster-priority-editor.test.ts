import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHosterPriorityEditor } from '../use-hoster-priority-editor';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source';
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
  },
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
    listDownloadRuns: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
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
      await result.current.reorder('mediafire', 'mega', 'before');
    });

    expect(result.current.items.map((item) => item.hoster)).toEqual(['mediafire', 'mega']);
    expect(source.setHosterPriority).toHaveBeenCalledWith('default', [
      { hoster: 'mediafire', priority: 0, enabled: true },
      { hoster: 'mega', priority: 1, enabled: true },
    ]);
  });

  it('rolls back to the previous order and surfaces an error when persistence fails', async () => {
    const source = createFakeSource({
      setHosterPriority: vi.fn().mockRejectedValue(new Error('network down')),
    });
    const { result } = renderHook(() => useHosterPriorityEditor(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.reorder('mediafire', 'mega', 'before');
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
      reorderPromise = result.current.reorder('mediafire', 'mega', 'before');
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));

    await act(async () => {
      resolvePersist?.();
      await reorderPromise;
    });

    expect(result.current.isSaving).toBe(false);
  });
});
