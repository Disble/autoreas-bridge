import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSchedulePanel } from '../use-schedule-panel';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source';
import type { PreferencesSource } from '../../../../../infrastructure/preferences-source';
import type { ScheduleConfig } from '../../../../../shared/contracts/download.types';
import { resetDownloadRuntimeStore } from '../../../../../shared/store/download-runtime-store';
import { resetPreferencesStore } from '../../../../../shared/store/preferences-store';

const baseConfig: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '03:30',
  enabled: true,
  lastRunAtMs: 1_700_000_000_000,
  lastRunStatus: 'ok',
  nextRunAtMs: 1_700_086_400_000,
  running: false,
  enabledWeekdays: 127,
  missedNotice: undefined,
};

function createSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn().mockResolvedValue(baseConfig),
    setScheduleConfig: vi.fn().mockResolvedValue('ok'),
    setHosterPriority: vi.fn(),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    runMissedScheduleNow: vi.fn().mockResolvedValue({ kind: 'settled', localDate: '2026-07-26', terminalStatus: 'ok' }),
    ignoreMissedSchedule: vi.fn().mockResolvedValue({ kind: 'settled', localDate: '2026-07-26', settlementReason: 'ignored' }),
    listDownloadRuns: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

function createPreferencesSource(overrides: Partial<PreferencesSource> = {}): PreferencesSource {
  return {
    getSeasonMode: vi.fn().mockResolvedValue(false),
    getDownloadsRoot: vi.fn().mockResolvedValue(''),
    setDownloadsRoot: vi.fn().mockResolvedValue('ok'),
    pickFolder: vi.fn().mockResolvedValue(''),
    getAutoStartEnabled: vi.fn().mockResolvedValue(true),
    setAutoStartEnabled: vi.fn().mockResolvedValue('ok'),
    ...overrides,
  };
}

describe('useSchedulePanel', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
    resetPreferencesStore();
    vi.clearAllMocks();
  });

  it('starts in the loading status', () => {
    const source = createSource();
    const { result } = renderHook(() => useSchedulePanel(source));

    expect(result.current.status).toBe('loading');
  });

  it('loads the schedule config and exposes the view model', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.viewModel.enabled).toBe(true);
    expect(result.current.viewModel.dailyTimeHHMM).toBe('03:30');
  });

  it('surfaces an error status when getScheduleConfig rejects', async () => {
    const source = createSource({ getScheduleConfig: vi.fn().mockRejectedValue(new Error('boom')) });
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('setEnabled persists the change via setScheduleConfig', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(source.setScheduleConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('setDailyTime persists the new time via setScheduleConfig', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setDailyTime('05:00');
    });

    expect(source.setScheduleConfig).toHaveBeenCalledWith(expect.objectContaining({ dailyTimeHHMM: '05:00' }));
  });

  it('setDailyTimeDraft updates the editable time without persisting on each keypress', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.setDailyTimeDraft('05:00');
    });

    expect(result.current.dailyTimeDraft).toBe('05:00');
    expect(source.setScheduleConfig).not.toHaveBeenCalled();
  });

  it('commitDailyTime persists the draft once editing finishes', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.setDailyTimeDraft('05:00');
    });
    await act(async () => {
      await result.current.commitDailyTime();
    });

    expect(source.setScheduleConfig).toHaveBeenCalledWith(expect.objectContaining({ dailyTimeHHMM: '05:00' }));
  });

  it('setWeekdays persists the new weekday mask while preserving enabled/dailyTimeHHMM', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setWeekdays(96);
    });

    expect(source.setScheduleConfig).toHaveBeenCalledWith(
      expect.objectContaining({ enabledWeekdays: 96, enabled: true, dailyTimeHHMM: '03:30' }),
    );
  });

  it('surfaces the backend reason when setScheduleConfig resolves a non-"ok" result', async () => {
    const source = createSource({ setScheduleConfig: vi.fn().mockResolvedValue('download store unavailable') });
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.saveErrorMessage).toBe('download store unavailable');
  });

  it('does not flip the view model when the save is rejected by a non-"ok" result', async () => {
    const source = createSource({
      getScheduleConfig: vi.fn().mockResolvedValue({ ...baseConfig, enabled: false }),
      setScheduleConfig: vi.fn().mockResolvedValue('download store unavailable'),
    });
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.viewModel.enabled).toBe(false);
    expect(source.getScheduleConfig).toHaveBeenCalledTimes(1); // no refresh after a failed save
  });

  it('surfaces a saveErrorMessage when setScheduleConfig rejects, without crashing', async () => {
    const source = createSource({ setScheduleConfig: vi.fn().mockRejectedValue(new Error('save failed')) });
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(result.current.saveErrorMessage).toBe('save failed');
  });

  it('refreshes the view model after a successful setScheduleConfig save', async () => {
    const source = createSource({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce(baseConfig)
        .mockResolvedValueOnce({ ...baseConfig, enabled: false }),
    });
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(result.current.viewModel.enabled).toBe(false);
  });

  it('refreshes the view model when a download run lifecycle event invalidates the store', async () => {
    let listener: (() => void) | undefined;
    const source = createSource({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce({ ...baseConfig, lastRunAtMs: 0, lastRunStatus: '' })
        .mockResolvedValueOnce({ ...baseConfig, lastRunAtMs: 1_700_000_123_000, lastRunStatus: 'ok' }),
      subscribeRunEvents: vi.fn((nextListener: () => void) => {
        listener = nextListener;
        return () => undefined;
      }),
    });
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.viewModel.lastRunLabel).toBe('Never');

    await act(async () => {
      listener?.();
    });

    await waitFor(() => expect(result.current.viewModel.lastRunStatus).toBe('ok'));
    expect(result.current.viewModel.lastRunLabel).toBe(new Date(1_700_000_123_000).toLocaleString());
  });

  it('calls preferences refresh on mount', async () => {
    const source = createSource();
    const preferencesSource = createPreferencesSource();

    renderHook(() => useSchedulePanel(source, preferencesSource));

    await waitFor(() => expect(preferencesSource.getSeasonMode).toHaveBeenCalledTimes(1));
  });

  it('seasonModeActive is true when the preferences store reports seasonMode true', async () => {
    const source = createSource();
    const preferencesSource = createPreferencesSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });

    const { result } = renderHook(() => useSchedulePanel(source, preferencesSource));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.viewModel.seasonModeActive).toBe(true));
  });

  it('seasonModeActive is false when the preferences store reports seasonMode false', async () => {
    const source = createSource();
    const preferencesSource = createPreferencesSource({ getSeasonMode: vi.fn().mockResolvedValue(false) });

    const { result } = renderHook(() => useSchedulePanel(source, preferencesSource));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.viewModel.seasonModeActive).toBe(false));
  });

  it('runMissedScheduleNow delegates to the runtime source and refreshes the schedule overlay', async () => {
    const source = createSource({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce({ ...baseConfig, missedNotice: { localDate: '2026-07-26', dueAtMs: 1_721_000_000_000 } })
        .mockResolvedValueOnce({ ...baseConfig, missedNotice: undefined }),
    });
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.runMissedScheduleNow('2026-07-26');
    });

    expect(source.runMissedScheduleNow).toHaveBeenCalledWith('2026-07-26');
    expect(result.current.viewModel.missedNotice).toBeUndefined();
  });

  it('ignoreMissedSchedule delegates to the runtime source and refreshes the schedule overlay', async () => {
    const source = createSource({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce({ ...baseConfig, missedNotice: { localDate: '2026-07-26', dueAtMs: 1_721_000_000_000 } })
        .mockResolvedValueOnce({ ...baseConfig, missedNotice: undefined }),
    });
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.ignoreMissedSchedule('2026-07-26');
    });

    expect(source.ignoreMissedSchedule).toHaveBeenCalledWith('2026-07-26');
    expect(result.current.viewModel.missedNotice).toBeUndefined();
  });

  it('keeps the notice visible and surfaces a message when Run now returns an unresolved terminal result', async () => {
    const source = createSource({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce({ ...baseConfig, missedNotice: { localDate: '2026-07-26', dueAtMs: 1_721_000_000_000 } })
        .mockResolvedValueOnce({
          ...baseConfig,
          missedNotice: { localDate: '2026-07-26', dueAtMs: 1_721_000_000_000, attemptStatus: 'partial' },
        }),
      runMissedScheduleNow: vi.fn().mockResolvedValue({ kind: 'unresolved_terminal', localDate: '2026-07-26', terminalStatus: 'partial' }),
    });
    const { result } = renderHook(() => useSchedulePanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.runMissedScheduleNow('2026-07-26');
    });

    expect(result.current.viewModel.missedNotice?.attemptStatus).toBe('partial');
    expect(result.current.missedActionMessage).toContain('partial');
  });
});
