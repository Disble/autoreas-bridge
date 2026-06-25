import { describe, expect, it } from 'vitest';
import {
  maskToWeekdayValues,
  toSchedulePanelViewModel,
  toScheduleSaveRequest,
  weekdayValuesToMask,
} from '../schedule-panel.helpers';
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

  it('exposes the enabled weekdays and their ToggleButton ids', () => {
    const viewModel = toSchedulePanelViewModel({ ...baseConfig, enabledWeekdays: 0b0011000 }); // Wed(3)+Thu(4)

    expect(viewModel.enabledWeekdays).toBe(0b0011000);
    expect(viewModel.selectedWeekdayValues).toEqual(['3', '4']);
  });

  it('flags willNeverRun when enabled with no weekdays selected', () => {
    expect(toSchedulePanelViewModel({ ...baseConfig, enabled: true, enabledWeekdays: 0 }).willNeverRun).toBe(true);
  });

  it('does not flag willNeverRun when disabled even with no weekdays', () => {
    expect(toSchedulePanelViewModel({ ...baseConfig, enabled: false, enabledWeekdays: 0 }).willNeverRun).toBe(false);
  });
});

describe('maskToWeekdayValues / weekdayValuesToMask', () => {
  it('maps an all-days mask to every option id', () => {
    expect(maskToWeekdayValues(127)).toEqual(['1', '2', '3', '4', '5', '6', '0']);
  });

  it('maps an empty mask to no ids', () => {
    expect(maskToWeekdayValues(0)).toEqual([]);
  });

  it('round-trips a Thu+Fri+Sat+Sun selection through the mask', () => {
    const mask = weekdayValuesToMask(['4', '5', '6', '0']);

    expect(mask).toBe((1 << 4) | (1 << 5) | (1 << 6) | (1 << 0));
    expect(maskToWeekdayValues(mask)).toEqual(['4', '5', '6', '0']);
  });

  it('ignores unknown ids when folding to a mask', () => {
    expect(weekdayValuesToMask(['nope', '4'])).toBe(1 << 4);
  });
});

describe('toScheduleSaveRequest', () => {
  it('builds a full ScheduleConfig write request preserving read-only run fields from the current config', () => {
    const request = toScheduleSaveRequest(baseConfig, { enabled: false, dailyTimeHHMM: '04:00', enabledWeekdays: 96 });

    expect(request).toEqual({
      mode: 'in_process',
      dailyTimeHHMM: '04:00',
      enabled: false,
      lastRunAtMs: 1_700_000_000_000,
      lastRunStatus: 'ok',
      nextRunAtMs: 1_700_086_400_000,
      running: false,
      enabledWeekdays: 96,
    });
  });
});
