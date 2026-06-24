import { describe, expect, it } from 'vitest';
import { toSchedulePanelViewModel, toScheduleSaveRequest } from '../schedule-panel.helpers';
import type { ScheduleConfig } from '../../../../../shared/contracts/download.types';

const baseConfig: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '03:30',
  enabled: true,
  lastRunAtMs: 1_700_000_000_000,
  lastRunStatus: 'ok',
  nextRunAtMs: 1_700_086_400_000,
  running: false,
};

describe('toSchedulePanelViewModel', () => {
  it('maps enabled/dailyTimeHHMM/running through unchanged', () => {
    const viewModel = toSchedulePanelViewModel(baseConfig);

    expect(viewModel.enabled).toBe(true);
    expect(viewModel.dailyTimeHHMM).toBe('03:30');
    expect(viewModel.running).toBe(false);
  });

  it('formats lastRunAtMs as a locale date-time string', () => {
    const viewModel = toSchedulePanelViewModel(baseConfig);

    expect(viewModel.lastRunLabel).toBe(new Date(1_700_000_000_000).toLocaleString());
  });

  it('formats nextRunAtMs as a locale date-time string', () => {
    const viewModel = toSchedulePanelViewModel(baseConfig);

    expect(viewModel.nextRunLabel).toBe(new Date(1_700_086_400_000).toLocaleString());
  });

  it('renders "Never" for lastRunLabel when lastRunAtMs is 0', () => {
    const viewModel = toSchedulePanelViewModel({ ...baseConfig, lastRunAtMs: 0 });

    expect(viewModel.lastRunLabel).toBe('Never');
  });

  it('renders "Not scheduled" for nextRunLabel when disabled', () => {
    const viewModel = toSchedulePanelViewModel({ ...baseConfig, enabled: false, nextRunAtMs: 0 });

    expect(viewModel.nextRunLabel).toBe('Not scheduled');
  });

  it('passes lastRunStatus through unchanged', () => {
    const viewModel = toSchedulePanelViewModel(baseConfig);

    expect(viewModel.lastRunStatus).toBe('ok');
  });
});

describe('toScheduleSaveRequest', () => {
  it('builds a full ScheduleConfig write request preserving read-only run fields from the current config', () => {
    const request = toScheduleSaveRequest(baseConfig, { enabled: false, dailyTimeHHMM: '04:00' });

    expect(request).toEqual({
      mode: 'in_process',
      dailyTimeHHMM: '04:00',
      enabled: false,
      lastRunAtMs: 1_700_000_000_000,
      lastRunStatus: 'ok',
      nextRunAtMs: 1_700_086_400_000,
      running: false,
    });
  });
});
