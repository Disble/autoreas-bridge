import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSchedulePanel } from '../use-schedule-panel';
import type { DownloadReadinessSnapshot, DownloadsSource, ScheduleConfig } from '../../../../../shared/contracts/download.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { createDownloadsSourceFake } from '../../../../../shared/hooks/use-missed-schedule-notice/__tests__/downloads.test-support';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { connectBridgeEvents, createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { makeSeason } from '../../../../../shared/season/__tests__/season.test-support';
import type { SeasonModeSource } from '../../../../../shared/season/season-mode/season-mode.types';
import { resetDownloadRuntimeStore } from '../../../../../shared/store/download-runtime-store/download-runtime-store.helpers';

/** Schedule config every case starts from, with no missed day pending. */
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

/** Readiness snapshot with nothing in it, the default the stubbed port returns. */
const emptyReadiness: DownloadReadinessSnapshot = {
  items: [],
  scheduledTotal: 0,
  scheduledReady: 0,
  scheduledBlocked: 0,
};

/**
 * Builds a fully stubbed downloads port, overridable per case.
 * @param overrides The calls a case replaces.
 * @returns The port.
 */
function createSource(overrides: Partial<DownloadsSource> = {}): DownloadsSource {
  return createDownloadsSourceFake({
    getScheduleConfig: vi.fn().mockResolvedValue(baseConfig),
    runMissedScheduleNow: vi.fn().mockResolvedValue({ kind: 'settled', localDate: '2026-07-26', terminalStatus: 'ok' }),
    ignoreMissedSchedule: vi.fn().mockResolvedValue({ kind: 'settled', localDate: '2026-07-26', settlementReason: 'ignored' }),
    listDownloadReadiness: vi.fn().mockResolvedValue(emptyReadiness),
    ...overrides,
  });
}

/**
 * Renders the panel hook under a wrapper whose downloads module is ready and
 * whose season module is in `season`, connected to the app's invalidation rules.
 * @param source The downloads port.
 * @param seasonSource The open-season port; no season is open by default.
 * @param season The season module's readiness.
 * @returns The hook result, `emitEvent` (fires one backend event) and `emitReadiness`.
 */
function renderPanel(
  source: DownloadsSource,
  seasonSource: SeasonModeSource = { readSeason: vi.fn().mockResolvedValue(null) },
  season: ModuleReadiness = status('season', 'ready'),
) {
  const { client, wrapper, emit } = createModulesTestWrapper(status('downloads', 'ready'), season);
  const { emit: emitEvent } = connectBridgeEvents(client);
  return { ...renderHook(() => useSchedulePanel(source, seasonSource), { wrapper }), emitEvent, emitReadiness: emit };
}

describe('useSchedulePanel', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
    vi.clearAllMocks();
  });

  it('starts in the loading status', () => {
    const source = createSource();
    const { result } = renderPanel(source);

    expect(result.current.status).toBe('loading');
  });

  it('loads the schedule config and exposes the view model', async () => {
    const source = createSource();
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.viewModel.enabled).toBe(true);
    expect(result.current.viewModel.dailyTimeHHMM).toBe('03:30');
  });

  it('surfaces an error status when getScheduleConfig rejects', async () => {
    const source = createSource({ getScheduleConfig: vi.fn().mockRejectedValue(new Error('boom')) });
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('loads the schedule readiness summary without changing the schedule status', async () => {
    const source = createSource({
      listDownloadReadiness: vi.fn().mockResolvedValue({
        items: [{ animeId: 'blocked', name: 'Blocked Anime', ready: false, reasons: ['unsupported_source'], scheduledToday: true }],
        scheduledTotal: 1,
        scheduledReady: 0,
        scheduledBlocked: 1,
      }),
    });
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.viewModel.readiness?.scheduledBlocked).toBe(1));

    expect(result.current.status).toBe('ready');
    expect(result.current.readinessErrorMessage).toBeUndefined();
  });

  it('surfaces a retryable readiness error without fabricating a readiness summary', async () => {
    const listDownloadReadiness = vi.fn().mockRejectedValue(new Error('readiness unavailable'));
    const source = createSource({ listDownloadReadiness });
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.readinessErrorMessage).toBe('readiness unavailable'));

    expect(result.current.status).toBe('ready');
    expect(result.current.viewModel.readiness).toBeUndefined();

    await act(async () => {
      await result.current.refreshReadiness();
    });

    expect(listDownloadReadiness).toHaveBeenCalledTimes(2);
  });

  it('setEnabled persists the change via setScheduleConfig', async () => {
    const source = createSource();
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(source.setScheduleConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('setDailyTime persists the new time via setScheduleConfig', async () => {
    const source = createSource();
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setDailyTime('05:00');
    });

    expect(source.setScheduleConfig).toHaveBeenCalledWith(expect.objectContaining({ dailyTimeHHMM: '05:00' }));
  });

  it('setDailyTimeDraft updates the editable time without persisting on each keypress', async () => {
    const source = createSource();
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.setDailyTimeDraft('05:00');
    });

    expect(result.current.dailyTimeDraft).toBe('05:00');
    expect(source.setScheduleConfig).not.toHaveBeenCalled();
  });

  it('commitDailyTime persists the draft once editing finishes', async () => {
    const source = createSource();
    const { result } = renderPanel(source);

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
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setWeekdays(96);
    });

    expect(source.setScheduleConfig).toHaveBeenCalledWith(
      expect.objectContaining({ enabledWeekdays: 96, enabled: true, dailyTimeHHMM: '03:30' }),
    );
  });

  it('surfaces the backend reason when setScheduleConfig rejects with it', async () => {
    const source = createSource({ setScheduleConfig: vi.fn().mockRejectedValue(new Error('download store unavailable')) });
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.saveErrorMessage).toBe('download store unavailable');
  });

  it('does not flip the view model when the save is rejected', async () => {
    const source = createSource({
      getScheduleConfig: vi.fn().mockResolvedValue({ ...baseConfig, enabled: false }),
      setScheduleConfig: vi.fn().mockRejectedValue(new Error('download store unavailable')),
    });
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.viewModel.enabled).toBe(false);
    expect(source.getScheduleConfig).toHaveBeenCalledTimes(1); // no refresh after a failed save
  });

  it('surfaces a saveErrorMessage when setScheduleConfig rejects, without crashing', async () => {
    const source = createSource({ setScheduleConfig: vi.fn().mockRejectedValue(new Error('save failed')) });
    const { result } = renderPanel(source);

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
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(result.current.viewModel.enabled).toBe(false);
  });

  it('refreshes the view model when a download run lifecycle event invalidates the schedule', async () => {
    const source = createSource({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce({ ...baseConfig, lastRunAtMs: 0, lastRunStatus: '' })
        .mockResolvedValueOnce({ ...baseConfig, lastRunAtMs: 1_700_000_123_000, lastRunStatus: 'ok' }),
    });
    const { result, emitEvent } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.viewModel.lastRunLabel).toBe('Never');

    act(() => emitEvent('schedule.run_settled'));

    await waitFor(() => expect(result.current.viewModel.lastRunStatus).toBe('ok'));
    expect(result.current.viewModel.lastRunLabel).toBe(new Date(1_700_000_123_000).toLocaleString());
  });

  it('seasonModeActive is true while a season is open', async () => {
    const seasonSource = { readSeason: vi.fn().mockResolvedValue(makeSeason()) };

    const { result } = renderPanel(createSource(), seasonSource);

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.viewModel.seasonModeActive).toBe(true));
    expect(seasonSource.readSeason).toHaveBeenCalledTimes(1);
  });

  it('seasonModeActive is false when no season is open', async () => {
    const seasonSource = { readSeason: vi.fn().mockResolvedValue(null) };

    const { result } = renderPanel(createSource(), seasonSource);

    await waitFor(() => expect(seasonSource.readSeason).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.viewModel.seasonModeActive).toBe(false);
  });

  it('seasonModeActive stays false without reading while the season module starts, then follows the open season once it is ready', async () => {
    const seasonSource = { readSeason: vi.fn().mockResolvedValue(makeSeason()) };
    const { result, emitReadiness } = renderPanel(createSource(), seasonSource, status('season', 'starting'));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.viewModel.seasonModeActive).toBe(false);
    expect(seasonSource.readSeason).not.toHaveBeenCalled();

    act(() => emitReadiness(status('season', 'ready')));

    await waitFor(() => expect(result.current.viewModel.seasonModeActive).toBe(true));
  });

  it('seasonModeActive is false when the season read fails, because the banner only announces an open season', async () => {
    const seasonSource = { readSeason: vi.fn().mockRejectedValue(createBridgeError('internal', 'read failed')) };

    const { result } = renderPanel(createSource(), seasonSource);

    await waitFor(() => expect(seasonSource.readSeason).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.viewModel.seasonModeActive).toBe(false);
  });

  it('runMissedScheduleNow delegates to the runtime source and refreshes the schedule overlay', async () => {
    const source = createSource({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce({ ...baseConfig, missedNotice: { localDate: '2026-07-26', dueAtMs: 1_721_000_000_000 } })
        .mockResolvedValueOnce({ ...baseConfig, missedNotice: undefined }),
    });
    const { result } = renderPanel(source);

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
    const { result } = renderPanel(source);

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
    const { result } = renderPanel(source);

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.runMissedScheduleNow('2026-07-26');
    });

    expect(result.current.viewModel.missedNotice?.attemptStatus).toBe('partial');
    expect(result.current.missedActionMessage).toContain('partial');
  });
});
