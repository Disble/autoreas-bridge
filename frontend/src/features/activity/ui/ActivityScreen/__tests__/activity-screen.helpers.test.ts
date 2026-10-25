import { describe, expect, it } from 'vitest';
import { createInitialFilters } from '../../../feed/activity-feed-filters.helpers';
import { buildDay, buildLine, NOW_MS } from '../../../feed/__tests__/activity-feed.fixtures';
import { toFeedEndMark, toFeedResolvedView, toOverviewRange } from '../activity-screen.helpers';

/** The filters every case starts from. */
const INITIAL = createInitialFilters(NOW_MS);

describe('toFeedResolvedView', () => {
  it.each([
    ['asks for a type when there is no query', undefined, [], 'no-types'],
    ['is empty when the read found nothing', { ...INITIAL, cursor: '', limit: 40, fromMs: 0, toMs: 0 }, [], 'empty'],
    ['shows rows otherwise', { ...INITIAL, cursor: '', limit: 40, fromMs: 0, toMs: 0 }, [buildDay(0, [buildLine()])], 'rows'],
  ] as const)('%s', (_case, query, days, view) => {
    expect(toFeedResolvedView(query, days)).toBe(view);
  });
});

describe('toFeedEndMark', () => {
  it.each([
    ['a picked range', { ...INITIAL, range: { fromMs: 1, toMs: 2 } }, 'Start of this range'],
    ['the 30-day window', { ...INITIAL, scale: '30d' as const }, 'Start of the last 30 days'],
  ])('ends the feed of %s', (_case, filters, mark) => {
    expect(toFeedEndMark(filters)).toBe(mark);
  });
});

describe('toOverviewRange', () => {
  it('reads the picked range, else 0 – 0 for the scale window', () => {
    const range = { fromMs: NOW_MS - 3_600_000, toMs: NOW_MS };

    expect(toOverviewRange({ ...INITIAL, range })).toEqual(range);
    expect(toOverviewRange(INITIAL)).toEqual({ fromMs: 0, toMs: 0 });
  });
});
