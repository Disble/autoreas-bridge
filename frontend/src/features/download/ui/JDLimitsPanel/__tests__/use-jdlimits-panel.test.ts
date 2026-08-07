import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useJDLimitsPanel } from '../use-jdlimits-panel';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source/download-runtime-source.types';

function createFakeSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    getJDMaxSimultaneousDownloads: vi.fn().mockResolvedValue(3),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn(),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    setEpisodeRenameEnabled: vi.fn(),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    cancelDownloadRun: vi.fn(),
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    listDownloadRuns: vi.fn(),
    listDownloadReadiness: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useJDLimitsPanel', () => {
  it('reports the limit JDownloader is configured with', async () => {
    const source = createFakeSource({ getJDMaxSimultaneousDownloads: vi.fn().mockResolvedValue(3) });

    const { result } = renderHook(() => useJDLimitsPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.maxSimultaneousDownloads).toBe(3);
    expect(result.current.isAvailable).toBe(true);
  });

  // 0 is the backend's "could not read it" signal, not a configured limit of zero. Rendering
  // it as a number would tell the user JDownloader downloads nothing, which is a lie.
  it('treats zero as an absent reading rather than a limit of zero', async () => {
    const source = createFakeSource({ getJDMaxSimultaneousDownloads: vi.fn().mockResolvedValue(0) });

    const { result } = renderHook(() => useJDLimitsPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isAvailable).toBe(false);
  });

  it('surfaces a read failure instead of showing a stale number', async () => {
    const source = createFakeSource({
      getJDMaxSimultaneousDownloads: vi.fn().mockRejectedValue(new Error('cfg unreadable')),
    });

    const { result } = renderHook(() => useJDLimitsPanel(source));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('cfg unreadable');
  });

  // The value is read from JDownloader's config file, and JD writes that file when the user
  // changes the setting. Refresh is the only way to pick up a change without a Bridge restart.
  it('re-reads the setting on refresh', async () => {
    const read = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(4);
    const source = createFakeSource({ getJDMaxSimultaneousDownloads: read });

    const { result } = renderHook(() => useJDLimitsPanel(source));
    await waitFor(() => expect(result.current.maxSimultaneousDownloads).toBe(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.maxSimultaneousDownloads).toBe(4);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('clears a previous failure once a refresh succeeds', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('cfg unreadable')).mockResolvedValueOnce(2);
    const source = createFakeSource({ getJDMaxSimultaneousDownloads: read });

    const { result } = renderHook(() => useJDLimitsPanel(source));
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.errorMessage).toBeUndefined();
    expect(result.current.maxSimultaneousDownloads).toBe(2);
  });
});
