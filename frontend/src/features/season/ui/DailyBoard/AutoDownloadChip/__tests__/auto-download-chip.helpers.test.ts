import { describe, expect, it } from 'vitest';
import type { ScheduleConfig } from '../../../../../../shared/contracts/download.types';
import { getAutoDownloadChip } from '../auto-download-chip.helpers';

/** Every weekday selected (bit 0 = Sunday … bit 6 = Saturday). */
const ALL_DAYS = 127;

/** Saturday 24 October 2026, local time. */
const SATURDAY = (hours: number, minutes = 0) => new Date(2026, 9, 24, hours, minutes);

/** An enabled 22:00 schedule on every day that has not run today. */
const schedule = (overrides: Partial<ScheduleConfig> = {}): ScheduleConfig => ({
  mode: 'in_process',
  dailyTimeHHMM: '22:00',
  enabled: true,
  lastRunAtMs: SATURDAY(-2).getTime(),
  lastRunStatus: 'ok',
  nextRunAtMs: 0,
  running: false,
  enabledWeekdays: ALL_DAYS,
  ...overrides,
});

describe('getAutoDownloadChip', () => {
  it.each([
    ['the time is still ahead today', schedule(), SATURDAY(18), { kind: 'scheduled', label: '22:00', tooltip: 'Scheduled download at 22:00', isActive: true }],
    ['a run is in progress', schedule({ running: true }), SATURDAY(22, 1), { kind: 'downloading', label: 'Downloading', tooltip: 'Download in progress', isActive: true }],
    [
      "today's run finished ok",
      schedule({ lastRunAtMs: SATURDAY(22).getTime(), lastRunStatus: 'ok' }),
      SATURDAY(23, 10),
      { kind: 'downloaded', label: '22:00', tooltip: 'Downloaded at 22:00', isActive: false },
    ],
    [
      "today's run failed",
      schedule({ lastRunAtMs: SATURDAY(22).getTime(), lastRunStatus: 'error' }),
      SATURDAY(23, 10),
      { kind: 'notCompleted', label: '22:00', tooltip: 'The 22:00 download did not complete', isActive: false },
    ],
    [
      "today's time passed with no run (the app was closed)",
      schedule(),
      SATURDAY(23, 10),
      { kind: 'notCompleted', label: '22:00', tooltip: 'The 22:00 download did not complete', isActive: false },
    ],
    [
      'today is not a selected day',
      schedule({ enabledWeekdays: ALL_DAYS & ~(1 << 6) }),
      SATURDAY(18),
      { kind: 'noneToday', label: 'No download', tooltip: 'No scheduled download today', isActive: false },
    ],
    [
      'a one-digit hour, which the scheduler accepts too',
      schedule({ dailyTimeHHMM: '9:05' }),
      SATURDAY(8),
      { kind: 'scheduled', label: '9:05', tooltip: 'Scheduled download at 9:05', isActive: true },
    ],
    [
      'the daily time is not a valid HH:MM',
      schedule({ dailyTimeHHMM: '' }),
      SATURDAY(18),
      { kind: 'noneToday', label: 'No download', tooltip: 'No scheduled download today', isActive: false },
    ],
    [
      'scheduled downloads are disabled, even while a run is in progress',
      schedule({ enabled: false, running: true }),
      SATURDAY(18),
      { kind: 'off', label: 'Off', tooltip: 'Scheduled downloads are off', isActive: false },
    ],
  ])('shows %s', (_name, config, now, expected) => {
    expect(getAutoDownloadChip(config, now)).toEqual(expected);
  });

  it('counts a run stamped within the tolerance before the minute as today’s, and an earlier one as not', () => {
    const justBefore = schedule({ lastRunAtMs: SATURDAY(21, 59).getTime() + 1 });
    const atTheEdge = schedule({ lastRunAtMs: SATURDAY(21, 59).getTime() });
    const morning = schedule({ lastRunAtMs: SATURDAY(9).getTime() });

    expect(getAutoDownloadChip(justBefore, SATURDAY(23)).kind).toBe('downloaded');
    expect(getAutoDownloadChip(atTheEdge, SATURDAY(23)).kind).toBe('notCompleted');
    expect(getAutoDownloadChip(morning, SATURDAY(23)).kind).toBe('notCompleted');
  });

  it('still shows the time as ahead at the scheduled instant itself, and as passed one minute later', () => {
    expect(getAutoDownloadChip(schedule(), SATURDAY(22)).kind).toBe('scheduled');
    expect(getAutoDownloadChip(schedule(), SATURDAY(22, 1)).kind).toBe('notCompleted');
  });
});
