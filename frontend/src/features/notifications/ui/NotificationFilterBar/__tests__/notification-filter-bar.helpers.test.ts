import { describe, expect, it } from 'vitest';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { mergeSeenNotificationSources, toNotificationSourceOptions } from '../notification-filter-bar.helpers';

/**
 * Builds a row carrying only the source these helpers read.
 * @param source The row's producing bounded context.
 * @returns One `NotificationRow`.
 */
function rowFrom(source: string): NotificationRow {
  return { id: 1, createdAtMs: 1_700_000_000_000, title: 'Run stopped', body: '', level: 'warning', source, actionCount: 0 };
}

describe('mergeSeenNotificationSources', () => {
  it('collects every source the loaded rows carry, alphabetically', () => {
    expect(mergeSeenNotificationSources([], [rowFrom('season'), rowFrom('download')])).toEqual(['download', 'season']);
  });

  it('keeps a source already offered even once the current page no longer carries it', () => {
    // Filtering to one source narrows the page to that source; the dropdown
    // must not collapse to the single option the user is already standing on.
    expect(mergeSeenNotificationSources(['device', 'download'], [rowFrom('download')])).toEqual(['device', 'download']);
  });

  it('returns the accumulated array by identity when the page brings nothing new', () => {
    const seen = ['download'];

    expect(mergeSeenNotificationSources(seen, [rowFrom('download')])).toBe(seen);
  });

  it('ignores a row that names no source at all', () => {
    expect(mergeSeenNotificationSources([], [rowFrom('')])).toEqual([]);
  });

  it('de-duplicates a source carried by several rows', () => {
    expect(mergeSeenNotificationSources([], [rowFrom('download'), rowFrom('download')])).toEqual(['download']);
  });
});

describe('toNotificationSourceOptions', () => {
  it('labels each raw source in title case while keeping the raw value the query is built from', () => {
    expect(toNotificationSourceOptions(['download', 'season'])).toEqual([
      { value: 'download', label: 'Download' },
      { value: 'season', label: 'Season' },
    ]);
  });

  it('offers nothing when no source has been seen yet', () => {
    expect(toNotificationSourceOptions([])).toEqual([]);
  });
});
