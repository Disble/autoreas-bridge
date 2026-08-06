import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEpisodeRenamePanel } from '../use-episode-rename-panel';
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
  hosterPriority: [],
  renameEpisodes: false,
};

function createFakeSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn().mockResolvedValue(baseConfig),
    getJDStatus: vi.fn(),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn(),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    setEpisodeRenameEnabled: vi.fn().mockResolvedValue('ok'),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    cancelDownloadRun: vi.fn(),
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    listDownloadRuns: vi.fn(),
    listDownloadReadiness: vi.fn(),
    subscribeRunEvents: vi.fn(),
    ...overrides,
  } as unknown as DownloadRuntimeSource;
}

describe('useEpisodeRenamePanel', () => {
  it('loads the persisted preference', async () => {
    const source = createFakeSource({
      getDownloadConfig: vi.fn().mockResolvedValue({ ...baseConfig, renameEpisodes: true }),
    });

    const { result } = renderHook(() => useEpisodeRenamePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.enabled).toBe(true);
  });

  // The source is built once outside the render callback on purpose: the hook
  // reloads whenever its `source` identity changes, so constructing a fresh fake
  // per render spins an endless effect loop that starves the rest of the file.
  it('starts disabled when the user has never opted in', async () => {
    const source = createFakeSource();
    const { result } = renderHook(() => useEpisodeRenamePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.enabled).toBe(false);
  });

  // The pending config promise is resolved before the test ends on purpose: a
  // promise left hanging keeps this hook's render pending inside the shared
  // environment, and every later test in the file then times out.
  it('reports the loading status until the preference arrives', async () => {
    let resolveConfig!: (config: DownloadConfig) => void;
    const pending = new Promise<DownloadConfig>((resolve) => {
      resolveConfig = resolve;
    });
    const source = createFakeSource({ getDownloadConfig: vi.fn().mockReturnValue(pending) });

    const { result } = renderHook(() => useEpisodeRenamePanel(source));

    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveConfig(baseConfig);
      await pending;
    });

    expect(result.current.status).toBe('ready');
  });

  it('persists the opt-in and keeps the new value', async () => {
    const setEpisodeRenameEnabled = vi.fn().mockResolvedValue('ok');
    const source = createFakeSource({ setEpisodeRenameEnabled });
    const { result } = renderHook(() => useEpisodeRenamePanel(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(setEpisodeRenameEnabled).toHaveBeenCalledWith(true);
    expect(result.current.enabled).toBe(true);
  });

  // The toggle flips optimistically so it never feels laggy, which means a
  // rejected write has to put it back -- otherwise the UI claims a setting the
  // backend never stored.
  it('rolls the toggle back when the backend refuses the write', async () => {
    const source = createFakeSource({
      setEpisodeRenameEnabled: vi.fn().mockResolvedValue('settings store unavailable'),
    });
    const { result } = renderHook(() => useEpisodeRenamePanel(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.errorMessage).toBe('settings store unavailable');
  });

  it('rolls the toggle back when the write throws', async () => {
    const source = createFakeSource({
      setEpisodeRenameEnabled: vi.fn().mockRejectedValue(new Error('bridge is gone')),
    });
    const { result } = renderHook(() => useEpisodeRenamePanel(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.errorMessage).toBe('bridge is gone');
  });

  it('surfaces a failure to load the preference', async () => {
    const source = createFakeSource({
      getDownloadConfig: vi.fn().mockRejectedValue(new Error('config unavailable')),
    });

    const { result } = renderHook(() => useEpisodeRenamePanel(source));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('config unavailable');
    expect(result.current.enabled).toBe(false);
  });

  it('clears a previous error once a later write succeeds', async () => {
    const setEpisodeRenameEnabled = vi
      .fn()
      .mockResolvedValueOnce('settings store unavailable')
      .mockResolvedValueOnce('ok');
    const source = createFakeSource({ setEpisodeRenameEnabled });
    const { result } = renderHook(() => useEpisodeRenamePanel(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });
    expect(result.current.errorMessage).toBe('settings store unavailable');

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.errorMessage).toBeUndefined();
    expect(result.current.enabled).toBe(true);
  });
});
