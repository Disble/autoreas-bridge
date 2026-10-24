import type { ActivityLedgerLine } from '../../history-source/history.types';
import type { ActivityFeedDay, ActivityFeedLine, ActivityFeedView, ActivityOverview, ActivityTypeCount } from '../../feed-source/feed.types';

/** Local noon of Thu, Oct 22 2026: the "now" of these tests. */
export const NOW_MS = new Date(2026, 9, 22, 12, 0).getTime();

/** Local midnight of `daysAgo` days before NOW_MS. */
export function dayStart(daysAgo: number): number {
  return new Date(2026, 9, 22 - daysAgo).getTime();
}

/**
 * Builds a feed line, overriding only what a case needs.
 *
 * @param overrides Feed-line fields to replace.
 * @param ledger Ledger-line fields to replace.
 * @returns The feed line.
 */
export function buildLine(overrides: Partial<ActivityFeedLine> = {}, ledger: Partial<ActivityLedgerLine> = {}): ActivityFeedLine {
  return {
    type: 'change',
    origin: 'phone',
    failed: false,
    slow: false,
    incidentId: undefined,
    traffic: undefined,
    run: undefined,
    ...overrides,
    line: {
      kind: 'change',
      id: '1',
      atMs: NOW_MS,
      phoneAtMs: undefined,
      domain: '',
      source: 'mobile',
      level: '',
      title: 'Frieren',
      detail: 'episode_adjusted',
      correlationId: '',
      beforeJson: '',
      afterJson: '',
      marks: [],
      ...ledger,
    },
  };
}

/**
 * Builds one day group from its lines.
 *
 * @param daysAgo Which day, counted back from NOW_MS.
 * @param lines The day's lines, newest first.
 * @returns The day.
 */
export function buildDay(daysAgo: number, lines: readonly ActivityFeedLine[]): ActivityFeedDay {
  return { dayStartMs: dayStart(daysAgo), lines };
}

/**
 * Builds a feed page.
 *
 * @param days The page's days.
 * @param nextCursor The page's cursor.
 * @returns The page.
 */
export function buildView(days: readonly ActivityFeedDay[], nextCursor = ''): ActivityFeedView {
  return { days, nextCursor };
}

/**
 * Builds an overview whose type counts are given and whose chart is empty.
 *
 * @param types The per-type counts.
 * @returns The overview.
 */
export function buildOverview(types: readonly ActivityTypeCount[]): ActivityOverview {
  return { slots: [], types };
}
