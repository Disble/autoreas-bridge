import { describe, expect, it } from 'vitest';
import type { WatchHistoryEntry } from '../../contracts/anime.types';
import { formatDayHeading, formatRowTime, groupEntriesByDay, toLocalDayKey } from '../watch-history.helpers';

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

describe('formatRowTime', () => {
  it('formats a zero-padded local HH:MM time', () => {
    expect(formatRowTime(new Date(2026, 8, 12, 9, 5, 0).getTime())).toBe('09:05');
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

    const groups = groupEntriesByDay(day);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ dayKey: '2026-09-12', heading: 'September 12, 2026', count: 3 });
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
