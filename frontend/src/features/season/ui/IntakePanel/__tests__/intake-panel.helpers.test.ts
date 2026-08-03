import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import {
  buildRawText,
  countMatchedWaitingForAvailability,
  countUnresolved,
  deriveIntakeDownloadFolder,
  formatCandidateOption,
  getMatchStatusColor,
  getMatchStatusLabel,
  splitIntakeRows,
} from '../intake-panel.helpers';

function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa-1',
    rawName: 'Dr. Stone',
    matchStatus: 'pending',
    matchedSlug: '',
    candidates: [],
    availability: 'waiting', availableEpisodes: 0,
    animeId: '', section: '', sectionOrder: 0,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',    ...overrides,
  };
}

describe('getMatchStatusLabel', () => {
  it('maps every status to a readable label with a raw fallback', () => {
    expect(getMatchStatusLabel('matched')).toBe('Matched');
    expect(getMatchStatusLabel('ambiguous')).toBe('Ambiguous');
    expect(getMatchStatusLabel('not_found')).toBe('Not found');
    expect(getMatchStatusLabel('pending')).toBe('Pending');
    expect(getMatchStatusLabel('discarded')).toBe('Discarded');
    expect(getMatchStatusLabel('weird')).toBe('weird');
  });
});

describe('getMatchStatusColor', () => {
  it('maps status to a semantic chip color', () => {
    expect(getMatchStatusColor('matched')).toBe('success');
    expect(getMatchStatusColor('ambiguous')).toBe('warning');
    expect(getMatchStatusColor('not_found')).toBe('danger');
    expect(getMatchStatusColor('pending')).toBe('default');
    expect(getMatchStatusColor('discarded')).toBe('default');
  });
});

describe('formatCandidateOption', () => {
  it('renders the title with a rounded percentage score', () => {
    expect(formatCandidateOption({ title: 'Dr. Stone', pageUrl: 'x', score: 0.954 })).toBe('Dr. Stone (95%)');
    expect(formatCandidateOption({ title: 'Sword Art', pageUrl: 'y', score: 0.6 })).toBe('Sword Art (60%)');
  });
});

describe('buildRawText', () => {
  it('joins only the editable (uncreated, non-discarded) row names', () => {
    const rows = [
      row({ rawName: 'Anime A' }),
      row({ rawName: 'Anime B', availability: 'created', availableEpisodes: 0, animeId: 'x' }),
      row({ rawName: 'Anime C', matchStatus: 'discarded' }),
      row({ rawName: 'Anime D' }),
    ];
    expect(buildRawText(rows)).toBe('Anime A\nAnime D');
  });

  it('keeps matched and not-found rows in the raw editor until they are created or discarded', () => {
    const rows = [
      row({ rawName: 'Matched waiting', matchStatus: 'matched', availability: 'waiting' }),
      row({ rawName: 'Not found', matchStatus: 'not_found' }),
      row({ rawName: 'Created', matchStatus: 'matched', availability: 'created', animeId: 'anime-a' }),
      row({ rawName: 'Discarded', matchStatus: 'discarded' }),
    ];

    expect(buildRawText(rows)).toBe('Matched waiting\nNot found');
  });
});

describe('splitIntakeRows', () => {
  it('separates editable from created and drops discarded', () => {
    const rows = [
      row({ id: 'a', rawName: 'A' }),
      row({ id: 'b', rawName: 'B', availability: 'created', availableEpisodes: 0, animeId: 'x' }),
      row({ id: 'c', rawName: 'C', matchStatus: 'discarded' }),
    ];
    const { editable, created } = splitIntakeRows(rows);
    expect(editable.map((r) => r.id)).toEqual(['a']);
    expect(created.map((r) => r.id)).toEqual(['b']);
  });
});

describe('countUnresolved', () => {
  it('counts pending and ambiguous rows only', () => {
    const rows = [
      row({ matchStatus: 'pending' }),
      row({ matchStatus: 'ambiguous' }),
      row({ matchStatus: 'matched' }),
      row({ matchStatus: 'discarded' }),
      row({ matchStatus: 'not_found' }),
    ];
    expect(countUnresolved(rows)).toBe(2);
  });
});

describe('countMatchedWaitingForAvailability', () => {
  it('counts matched rows that still need an availability check before creation', () => {
    const rows = [
      row({ matchStatus: 'matched', availability: 'waiting' }),
      row({ matchStatus: 'matched', availability: 'available' }),
      row({ matchStatus: 'ambiguous', availability: 'waiting' }),
      row({ matchStatus: 'matched', availability: 'created', animeId: 'anime-a' }),
    ];
    expect(countMatchedWaitingForAvailability(rows)).toBe(1);
  });
});

describe('deriveIntakeDownloadFolder', () => {
  it('previews the backend default folder using the configured downloads root and sanitized anime name', () => {
    expect(deriveIntakeDownloadFolder('D:/Anime', 'Re:Zero')).toBe('D:/Anime/Re Zero');
    expect(deriveIntakeDownloadFolder('D:\\Anime', 'Fate/stay night')).toBe('D:\\Anime\\Fate stay night');
    expect(deriveIntakeDownloadFolder('D:/Anime///', '  Steins;Gate...  ')).toBe('D:/Anime/Steins;Gate');
  });

  it('returns an empty preview when the root or sanitized name is empty', () => {
    expect(deriveIntakeDownloadFolder('', 'Naruto')).toBe('');
    expect(deriveIntakeDownloadFolder('D:/Anime', `:/\\|`)).toBe('');
  });
});
