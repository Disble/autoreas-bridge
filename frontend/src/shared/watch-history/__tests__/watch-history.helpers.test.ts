import { describe, expect, it } from 'vitest';
import type { WatchHistoryEntry } from '../../contracts/anime.types';
import {
  formatCompactDateRange,
  formatDayHeading,
  formatDayListHeading,
  formatEpisodeCount,
  formatRowDateTime,
  formatRowShortDateTime,
  formatRowTime,
  formatShortDate,
  groupEntriesByDay,
  toLocalDayKey,
} from '../watch-history.helpers';

/** Fixed "now" for the year-aware formatters: 2026-09-13 12:00 local. */
const NOW_MS = new Date(2026, 8, 13, 12, 0, 0).getTime();

/** Builds a minimal WatchHistoryEntry fixture, overriding only what a case needs. */
function entry(overrides: Partial<WatchHistoryEntry>): WatchHistoryEntry {
  return {
    id: 1,
    animeId: 'anime-1',
    animeName: 'Frieren',
    episode: 1,
    cycle: 1,
    watchedAtMs: new Date(2026, 8, 12, 12, 0, 0).getTime(),
    source: 'desktop',
    ...overrides,
  };
}

describe('toLocalDayKey', () => {
  it.each([
    [new Date(2026, 8, 12, 0, 0, 0).getTime(), '2026-09-12'],
    [new Date(2026, 8, 12, 23, 59, 59).getTime(), '2026-09-12'],
    [new Date(2026, 0, 5, 12, 0, 0).getTime(), '2026-01-05'],
  ])('maps %i to its local calendar day %s', (millis, expected) => {
    expect(toLocalDayKey(millis)).toBe(expected);
  });
});

describe('formatDayHeading', () => {
  it('formats a long-form local day heading', () => {
    expect(formatDayHeading(new Date(2026, 8, 12, 12, 0, 0).getTime())).toBe('September 12, 2026');
  });
});

describe('formatDayListHeading', () => {
  it.each([
    ['a day in the current year without its year', new Date(2026, 8, 12, 17, 16).getTime(), 'Saturday, September 12'],
    ['a day in another year with its year', new Date(2025, 11, 31, 23, 0).getTime(), 'Wednesday, December 31, 2025'],
  ])('formats %s', (_case, millis, expected) => {
    expect(formatDayListHeading(millis, NOW_MS)).toBe(expected);
  });
});

describe('formatEpisodeCount', () => {
  it.each([
    [0, '0 episodes'],
    [1, '1 episode'],
    [2, '2 episodes'],
  ])('reads %i as "%s"', (count, expected) => {
    expect(formatEpisodeCount(count)).toBe(expected);
  });
});

describe('formatShortDate', () => {
  it('formats a short month, day and year', () => {
    expect(formatShortDate(new Date(2021, 7, 16, 10, 0).getTime())).toBe('Aug 16, 2021');
  });
});

describe('formatCompactDateRange', () => {
  it.each([
    ['names the shared year once', new Date(2026, 7, 29).getTime(), new Date(2026, 8, 11).getTime(), 'Aug 29 – Sep 11, 2026'],
    ['names both years when they differ', new Date(2025, 11, 30).getTime(), new Date(2026, 0, 2).getTime(), 'Dec 30, 2025 – Jan 2, 2026'],
  ])('%s', (_case, start, end, expected) => {
    expect(formatCompactDateRange(start, end)).toBe(expected);
  });
});

describe('formatRowShortDateTime', () => {
  it('formats date and time without the weekday as "Sep 12 · 17:16"', () => {
    expect(formatRowShortDateTime(new Date(2026, 8, 12, 17, 16).getTime())).toBe('Sep 12 · 17:16');
  });

  it('zero-pads a single-digit morning time', () => {
    expect(formatRowShortDateTime(new Date(2026, 0, 5, 9, 7).getTime())).toBe('Jan 5 · 09:07');
  });
});

describe('formatRowTime', () => {
  it('formats a zero-padded local HH:MM time', () => {
    expect(formatRowTime(new Date(2026, 8, 12, 9, 5, 0).getTime())).toBe('09:05');
  });
});

describe('formatRowDateTime', () => {
  it('formats date and time together as "Fri, Sep 11 · 20:03"', () => {
    expect(formatRowDateTime(new Date(2026, 8, 11, 20, 3, 0).getTime())).toBe('Fri, Sep 11 · 20:03');
  });

  it('zero-pads a single-digit morning time', () => {
    expect(formatRowDateTime(new Date(2026, 0, 5, 9, 7, 0).getTime())).toBe('Mon, Jan 5 · 09:07');
  });
});

describe('groupEntriesByDay', () => {
  it('returns an empty list for no entries', () => {
    expect(groupEntriesByDay([])).toEqual([]);
  });

  it('groups same-day entries under one heading with an exact count, newest first', () => {
    const day = [
      entry({ id: 3, episode: 3, watchedAtMs: new Date(2026, 8, 12, 20, 0, 0).getTime() }),
      entry({ id: 2, episode: 2, watchedAtMs: new Date(2026, 8, 12, 12, 0, 0).getTime() }),
      entry({ id: 1, episode: 1, watchedAtMs: new Date(2026, 8, 12, 8, 0, 0).getTime() }),
    ];

    const groups = groupEntriesByDay(day, NOW_MS);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ dayKey: '2026-09-12', heading: 'Saturday, September 12', count: 3 });
    expect(groups[0]?.entries.map((item) => item.id)).toEqual([3, 2, 1]);
  });

  it('marks only the trailing (oldest loaded) group as partial', () => {
    const entries = [
      entry({ id: 2, watchedAtMs: new Date(2026, 8, 12, 12, 0, 0).getTime() }),
      entry({ id: 1, watchedAtMs: new Date(2026, 8, 11, 12, 0, 0).getTime() }),
    ];

    const groups = groupEntriesByDay(entries);

    expect(groups.map((group) => group.partial)).toEqual([false, true]);
  });

  it('settles a trailing group once an older-day row arrives across a page boundary', () => {
    // Page 1 ends mid-day: two rows for Sep 12, nothing older loaded yet.
    const page1 = [
      entry({ id: 4, watchedAtMs: new Date(2026, 8, 12, 20, 0, 0).getTime() }),
      entry({ id: 3, watchedAtMs: new Date(2026, 8, 12, 12, 0, 0).getTime() }),
    ];
    const afterPage1 = groupEntriesByDay(page1);

    expect(afterPage1).toHaveLength(1);
    expect(afterPage1[0]).toMatchObject({ dayKey: '2026-09-12', count: 2, partial: true });

    // Page 2 continues Sep 12 then reaches an older day, proving Sep 12 complete.
    const page2 = [
      entry({ id: 2, watchedAtMs: new Date(2026, 8, 12, 8, 0, 0).getTime() }),
      entry({ id: 1, watchedAtMs: new Date(2026, 8, 11, 9, 0, 0).getTime() }),
    ];
    const afterPage2 = groupEntriesByDay([...page1, ...page2]);

    expect(afterPage2).toHaveLength(2);
    expect(afterPage2[0]).toMatchObject({ dayKey: '2026-09-12', count: 3, partial: false });
    expect(afterPage2[1]).toMatchObject({ dayKey: '2026-09-11', count: 1, partial: true });
  });
});
