import { describe, expect, it } from 'vitest';
import type { SeasonAnimeRow, SeasonMatchingProgressNotice } from '../../../../../shared/contracts/season.types';
import { mergeIntakeMatchingProgress } from '../intake-matching-overlay.helpers';

/** Builds an intake row with an unrelated field that must survive progress. */
function row(id: string): SeasonAnimeRow {
  return { id, rawName: id, matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'pending', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 3, gradeSource: '', skipGrading: false, consideration: '' };
}

/** Builds a progress notice for one row. */
function notice(rowId: string): SeasonMatchingProgressNotice {
  return { seasonId: 'season', phase: 'name_matching', rowId, rawName: 'resolved', matchStatus: 'matched', matchedSlug: 'slug', candidates: [], availability: 'available', availableEpisodes: 4 };
}

describe('mergeIntakeMatchingProgress', () => {
  it('overlays only matching rows and preserves other query data', () => {
    const rows = [row('a'), row('b')];
    expect(mergeIntakeMatchingProgress(rows, { a: notice('a'), missing: notice('missing') })).toEqual([
      { ...rows[0], rawName: 'resolved', matchStatus: 'matched', matchedSlug: 'slug', availability: 'available', availableEpisodes: 4 },
      rows[1],
    ]);
    expect(rows[0].matchStatus).toBe('pending');
  });
});
