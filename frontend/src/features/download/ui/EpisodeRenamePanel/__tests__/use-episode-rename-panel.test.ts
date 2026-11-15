import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEpisodeRenamePanel } from '../use-episode-rename-panel';
import type { DownloadConfig, DownloadsSource } from '../../../../../shared/contracts/download.types';
import { createDownloadsSourceFake, createDownloadsWrapper } from '../../../../../shared/hooks/use-missed-schedule-notice/__tests__/downloads.test-support';

/** Download config every case starts from, with the rename opt-in off. */
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

/**
 * Builds a fully stubbed downloads port, overridable per case.
 * @param overrides The calls a case replaces.
 * @returns The port.
 */
function createSource(overrides: Partial<DownloadsSource> = {}): DownloadsSource {
  return createDownloadsSourceFake({ getDownloadConfig: vi.fn().mockResolvedValue(baseConfig), ...overrides });
}

describe('useEpisodeRenamePanel', () => {
  it('loads the persisted preference', async () => {
    const source = createSource({
      getDownloadConfig: vi.fn().mockResolvedValue({ ...baseConfig, renameEpisodes: true }),
    });

    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.enabled).toBe(true);
  });

  it('starts disabled when the user has never opted in', async () => {
    const source = createSource();
    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });

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
    const source = createSource({ getDownloadConfig: vi.fn().mockReturnValue(pending) });

    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });

    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveConfig(baseConfig);
      await pending;
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it.each([['success', false, 2], ['failure', true, 1]] as const)(
    'reads config the expected number of times after save %s',
    async (_outcome, fails, expectedReads) => {
      const getDownloadConfig = vi.fn().mockResolvedValue(baseConfig);
      const setEpisodeRenameEnabled = fails ? vi.fn().mockRejectedValue(new Error('save failed')) : vi.fn().mockResolvedValue(undefined);
      const source = createSource({ getDownloadConfig, setEpisodeRenameEnabled });
      const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });
      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(getDownloadConfig).toHaveBeenCalledTimes(1);

      await act(async () => { await result.current.setEnabled(true); });

      expect(getDownloadConfig).toHaveBeenCalledTimes(expectedReads);
    },
  );

  it('persists the opt-in and keeps the new value', async () => {
    const setEpisodeRenameEnabled = vi.fn().mockResolvedValue(undefined);
    const source = createSource({ setEpisodeRenameEnabled });
    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });
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
    const source = createSource({
      setEpisodeRenameEnabled: vi.fn().mockRejectedValue(new Error('settings store unavailable')),
    });
    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.errorMessage).toBe('settings store unavailable');
  });

  it('rolls the toggle back when the write throws', async () => {
    const source = createSource({
      setEpisodeRenameEnabled: vi.fn().mockRejectedValue(new Error('bridge is gone')),
    });
    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.errorMessage).toBe('bridge is gone');
  });

  it('surfaces a failure to load the preference', async () => {
    const source = createSource({
      getDownloadConfig: vi.fn().mockRejectedValue(new Error('config unavailable')),
    });

    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('config unavailable');
    expect(result.current.enabled).toBe(false);
  });

  // `isSaving` is what disables the switch mid-write. Untested, the toggle can be
  // double-fired and the second write races the first.
  it('reports isSaving for exactly as long as the write is in flight', async () => {
    let resolveWrite!: (result: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveWrite = resolve;
    });
    const source = createSource({ setEpisodeRenameEnabled: vi.fn().mockReturnValue(pending) });
    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isSaving).toBe(false);

    let write: Promise<void>;
    act(() => {
      write = result.current.setEnabled(true);
    });
    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      resolveWrite('ok');
      await write;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });

  it('stops reporting isSaving after a refused write', async () => {
    const source = createSource({
      setEpisodeRenameEnabled: vi.fn().mockRejectedValue(new Error('settings store unavailable')),
    });
    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.isSaving).toBe(false);
  });

  it('stops reporting isSaving after a thrown write', async () => {
    const source = createSource({
      setEpisodeRenameEnabled: vi.fn().mockRejectedValue(new Error('bridge is gone')),
    });
    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.isSaving).toBe(false);
  });

  it('is disabled before the preference has loaded', () => {
    const source = createSource({ getDownloadConfig: vi.fn().mockReturnValue(new Promise(() => undefined)) });

    const { result, unmount } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });

    expect(result.current.enabled).toBe(false);
    unmount();
  });

  // A rejection with no usable message must still say something actionable
  // rather than rendering an empty error box.
  it('falls back to a readable message when the write rejects with no message', async () => {
    const source = createSource({ setEpisodeRenameEnabled: vi.fn().mockRejectedValue({}) });
    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.errorMessage).toBe('Failed to save the episode rename setting');
  });

  it('falls back to a readable message when the load rejects with no message', async () => {
    const source = createSource({ getDownloadConfig: vi.fn().mockRejectedValue({}) });

    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('Failed to load the episode rename setting');
  });

  // The rollback target has to be the value at the time of THAT write. Reading a
  // stale `enabled` would roll a failed opt-out back to the wrong state.
  it('rolls back to the value the toggle held when that write started', async () => {
    const setEpisodeRenameEnabled = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('settings store unavailable'));
    const source = createSource({ setEpisodeRenameEnabled });
    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });
    expect(result.current.enabled).toBe(true);

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(result.current.enabled).toBe(true);
  });

  it('clears a previous error once a later write succeeds', async () => {
    const setEpisodeRenameEnabled = vi
      .fn()
      .mockRejectedValueOnce(new Error('settings store unavailable'))
      .mockResolvedValueOnce(undefined);
    const source = createSource({ setEpisodeRenameEnabled });
    const { result } = renderHook(() => useEpisodeRenamePanel(source), { wrapper: createDownloadsWrapper().wrapper });
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
