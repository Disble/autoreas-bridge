import { describe, expect, it } from 'vitest';
import type { ActivityChartSlot } from '../../feed-source/feed.types';
import { selectionFromDrag, toChartBars } from '../activity-chart.helpers';
import { countFailures, toFailureMenuKeys, toFailureRows, toTypeToggles } from '../activity-feed-counts.helpers';
import { NOW_MS, buildOverview, dayStart } from './activity-feed.fixtures';

/** Three hourly slots ending with the current hour. */
const HOURS: readonly ActivityChartSlot[] = [10, 11, 12].map((hour, index) => ({
  startMs: new Date(2026, 9, 22, hour).getTime(),
  endMs: new Date(2026, 9, 22, hour + 1).getTime(),
  count: [0, 50, 100][index],
  failed: [0, 0, 3][index],
}));

describe('toChartBars', () => {
  it('scales each bar to the busiest slot, caps failures in red and names each slot by its counts', () => {
    const bars = toChartBars(HOURS, '24h', undefined);

    expect(bars.map((bar) => [bar.heightPercent, bar.hasFailure, bar.state])).toEqual([
      [0, false, 'idle'],
      [50, false, 'idle'],
      [100, true, 'idle'],
    ]);
    expect(bars[2].label).toBe('Oct 22, 12:00 – 13:00 · 100 lines · 3 failed');
    expect(bars.map((bar) => bar.isNow)).toEqual([false, false, true]);
  });

  it('keeps a quiet slot visible with a minimum height', () => {
    const bars = toChartBars([{ ...HOURS[0], count: 1 }, HOURS[2]], '24h', undefined);

    expect(bars[0].heightPercent).toBe(4);
  });

  it('marks the bars inside the selection and dims the rest', () => {
    const bars = toChartBars(HOURS, '24h', { fromMs: HOURS[1].startMs, toMs: HOURS[1].endMs - 1 });

    expect(bars.map((bar) => bar.state)).toEqual(['dimmed', 'selected', 'dimmed']);
  });

  it('labels a daily slot by its date', () => {
    const [bar] = toChartBars([{ startMs: dayStart(1), endMs: dayStart(0), count: 1, failed: 0 }], '7d', undefined);

    expect(bar.label).toBe('Wed, Oct 21 · 1 line');
  });
});

describe('selectionFromDrag', () => {
  it('selects the dragged bars in either direction, ending no later than now', () => {
    expect(selectionFromDrag(HOURS, 2, 1, undefined, NOW_MS)).toEqual({ fromMs: HOURS[1].startMs, toMs: NOW_MS });
  });
});

describe('overview counts', () => {
  const overview = buildOverview([
    { type: 'change', lines: 12, failed: 1 },
    { type: 'traffic', lines: 30, failed: 0 },
    { type: 'system', lines: 2, failed: 2 },
  ]);

  it('gives each toggle its line and failure counts, unknown while no overview is read', () => {
    expect(toTypeToggles(overview).slice(0, 3)).toEqual([
      { type: 'change', label: 'Changes', lines: 12, failed: 1 },
      { type: 'traffic', label: 'Traffic', lines: 30, failed: 0 },
      { type: 'download', label: 'Downloads', lines: 0, failed: 0 },
    ]);
    expect(toTypeToggles(undefined)[0].lines).toBeUndefined();
  });

  it('counts the failures of every type, Bridge included, for the button and the menu rows', () => {
    expect(countFailures(overview)).toBe(3);
    expect(toFailureRows(overview).map((row) => [row.type, row.failed])).toEqual([
      ['change', 1],
      ['traffic', 0],
      ['download', 0],
      ['task', 0],
      ['edit', 0],
      ['system', 2],
    ]);
  });
});

describe('toFailureMenuKeys', () => {
  it('disables the rows with no failure, never selects them, and keeps their pick', () => {
    const rows = toFailureRows(buildOverview([{ type: 'change', lines: 3, failed: 1 }]));

    const keys = toFailureMenuKeys(rows, ['change', 'system']);

    expect([...keys.selected]).toEqual(['change']);
    expect([...keys.disabled]).toEqual(['traffic', 'download', 'task', 'edit', 'system']);
    expect(keys.keptDisabled).toEqual(['system']);
  });
});

describe('chart ticks', () => {
  /** One daily slot `daysAgo` days back, with one line. */
  const daySlot = (daysAgo: number): ActivityChartSlot => ({ startMs: dayStart(daysAgo), endMs: dayStart(daysAgo - 1), count: 1, failed: 0 });
  /** One hourly slot starting at `hour` today. */
  const hourSlot = (hour: number): ActivityChartSlot => ({ startMs: new Date(2026, 9, 22, hour).getTime(), endMs: new Date(2026, 9, 22, hour + 1).getTime(), count: 1, failed: 0 });

  it.each([
    ['24 h marks every third hour and midnight as Today', '24h', [hourSlot(0), hourSlot(2), hourSlot(3)], ['Today', '', '03']],
    ['7 days names each weekday and date', '7d', [daySlot(2), daySlot(1), daySlot(0)], ['Tue 20', 'Wed 21', 'Today']],
    ['30 days marks every seventh day from today', '30d', Array.from({ length: 8 }, (_unused, index) => daySlot(7 - index)), ['Oct 15', '', '', '', '', '', '', 'Today']],
    ['90 days names the first of each month', '90d', [daySlot(22), daySlot(21), daySlot(0)], ['', 'Oct', 'Today']],
  ] as const)('%s', (_case, scale, slots, ticks) => {
    const bars = toChartBars(slots, scale, undefined);

    expect(bars.map((bar) => bar.tick)).toEqual(ticks);
    expect(bars.map((bar) => bar.isTodayTick)).toEqual(ticks.map((tick) => tick === 'Today'));
  });
});
