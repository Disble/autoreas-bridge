import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSchedulePanel } from '../use-schedule-panel';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source';
import type { ScheduleConfig } from '../../../../../shared/contracts/download.types';

const baseConfig: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '03:30',
  enabled: true,
  lastRunAtMs: 1_700_000_000_000,
  lastRunStatus: 'ok',
  nextRunAtMs: 1_700_086_400_000,
  running: false,
  enabledWeekdays: 127,
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
    listDownloadRuns: vi.fn(),
    ...overrides,
  };
}

describe('useSchedulePanel', () => {
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
});
