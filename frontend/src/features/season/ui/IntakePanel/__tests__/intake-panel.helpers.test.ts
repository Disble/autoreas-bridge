import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import type { AnimeMetadataSelection } from '../../../../../shared/metadata-lookup/metadata-lookup.types';
import {
  buildFolderPreviews,
  buildRawText,
  buildSeasonCreateMetadata,
  collectFolderOverrides,
  compactMetadataPatch,
  countMatchedWaitingForAvailability,
  countSearchFailed,
  countUnresolved,
  isCreatableRow,
  deriveIntakeDownloadFolder,
  formatAppliedMetadataFields,
  formatCandidateOption,
  formatMetadataSummary,
  getMatchStatusColor,
  getMatchStatusLabel,
  pickRowEntries,
  splitIntakeRows,
  toHeldMetadataPatch,
  toIntakeMetadataPatch,
  toSeasonCreateMetadata,
  toggleSelection,
} from '../intake-panel.helpers';

/** Builds a pending, uncreated intake row; override only what a case is about. */
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
    expect(getMatchStatusLabel('search_failed')).toBe('Search failed');
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
    expect(getMatchStatusColor('search_failed')).toBe('danger');
  });
});

describe('countSearchFailed', () => {
  it('counts only the rows whose search failed', () => {
    const rows = [
      row({ matchStatus: 'search_failed' }),
      row({ matchStatus: 'pending' }),
      row({ matchStatus: 'ambiguous' }),
      row({ matchStatus: 'not_found' }),
      row({ matchStatus: 'search_failed' }),
    ];
    expect(countSearchFailed(rows)).toBe(2);
  });
});

describe('isCreatableRow', () => {
  it('is false for a search_failed row: only a matched row with episode 1 online can be created', () => {
    expect(isCreatableRow(row({ matchStatus: 'search_failed', availability: 'available' }))).toBe(false);
    expect(
      isCreatableRow(row({ matchStatus: 'matched', availability: 'available', availableEpisodes: 1 })),
    ).toBe(true);
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
      row({ matchStatus: 'search_failed' }),
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
  it('previews the backend default folder using the configured library root and sanitized anime name', () => {
    expect(deriveIntakeDownloadFolder('D:/Anime', 'Re:Zero')).toBe('D:/Anime/Re Zero');
    expect(deriveIntakeDownloadFolder('D:\\Anime', 'Fate/stay night')).toBe('D:\\Anime\\Fate stay night');
    expect(deriveIntakeDownloadFolder('D:/Anime///', '  Steins;Gate...  ')).toBe('D:/Anime/Steins;Gate');
  });

  it('returns an empty preview when the root or sanitized name is empty', () => {
    expect(deriveIntakeDownloadFolder('', 'Naruto')).toBe('');
    expect(deriveIntakeDownloadFolder('D:/Anime', `:/\\|`)).toBe('');
  });
});

describe('collectFolderOverrides', () => {
  it('keeps only the ids that carry a non-empty override', () => {
    const overrides = { 'sa-1': 'D:/Anime/One', 'sa-2': '', 'sa-3': 'D:/Anime/Three' };

    expect(collectFolderOverrides(['sa-1', 'sa-2', 'sa-3'], overrides)).toEqual({
      'sa-1': 'D:/Anime/One',
      'sa-3': 'D:/Anime/Three',
    });
  });

  it('ignores ids absent from the override map', () => {
    expect(collectFolderOverrides(['sa-1', 'sa-9'], { 'sa-1': 'D:/Anime/One' })).toEqual({
      'sa-1': 'D:/Anime/One',
    });
  });

  it('returns an empty map when no id resolves', () => {
    expect(collectFolderOverrides(['sa-2'], { 'sa-2': '' })).toEqual({});
  });
});

describe('buildFolderPreviews', () => {
  it('prefers a non-empty override over the derived default', () => {
    const rows = [row({ id: 'sa-1', rawName: 'Dr. Stone' })];

    expect(buildFolderPreviews('D:/Anime', rows, { 'sa-1': 'D:/Custom' })).toEqual({
      'sa-1': 'D:/Custom',
    });
  });

  it('falls back to the derived default when the override is empty', () => {
    const rows = [row({ id: 'sa-1', rawName: 'Dr. Stone' })];

    expect(buildFolderPreviews('D:/Anime', rows, { 'sa-1': '' })).toEqual({
      'sa-1': 'D:/Anime/Dr. Stone',
    });
  });

  it('omits a row entirely when neither an override nor a default resolves', () => {
    const rows = [row({ id: 'sa-1', rawName: 'Dr. Stone' })];

    expect(buildFolderPreviews('', rows, {})).toEqual({});
  });

  it('previews each row independently', () => {
    const rows = [row({ id: 'sa-1', rawName: 'One' }), row({ id: 'sa-2', rawName: 'Two' })];

    expect(buildFolderPreviews('D:/Anime', rows, { 'sa-2': 'D:/Custom' })).toEqual({
      'sa-1': 'D:/Anime/One',
      'sa-2': 'D:/Custom',
    });
  });
});

describe('toggleSelection', () => {
  it('adds an id that is absent', () => {
    expect([...toggleSelection(new Set(['sa-1']), 'sa-2')]).toEqual(['sa-1', 'sa-2']);
  });

  it('removes an id that is present', () => {
    expect([...toggleSelection(new Set(['sa-1', 'sa-2']), 'sa-1')]).toEqual(['sa-2']);
  });

  it('returns a new set rather than mutating the previous one', () => {
    const previous = new Set(['sa-1']);
    const next = toggleSelection(previous, 'sa-2');

    expect(next).not.toBe(previous);
    expect([...previous]).toEqual(['sa-1']);
  });
});

/** Every field a confirmed lookup can map, so a case can blank exactly one. */
const FULL_SELECTION: AnimeMetadataSelection = {
  name: 'Dr. Stone',
  kind: '0',
  totalEpisodes: '24',
  duration: '24 min.',
  origin: 'Manga',
  genres: 'Action, Adventure',
  studios: 'TMS Entertainment',
  coverURL: 'https://cdn.myanimelist.net/images/anime/1.jpg',
  unfilled: ['Studios'],
};

describe('toIntakeMetadataPatch', () => {
  it('maps every allow-listed field of a confirmed selection', () => {
    expect(toIntakeMetadataPatch(FULL_SELECTION)).toEqual({
      name: 'Dr. Stone',
      kind: '0',
      totalEpisodes: '24',
      duration: '24 min.',
      origin: 'Manga',
      genres: 'Action, Adventure',
      studios: 'TMS Entertainment',
      coverURL: 'https://cdn.myanimelist.net/images/anime/1.jpg',
    });
  });

  it('omits an optional field the lookup did not map instead of defaulting it', () => {
    expect(toIntakeMetadataPatch({ name: 'Dr. Stone', unfilled: ['Type'] })).toEqual({ name: 'Dr. Stone' });
  });

  it('has no path into the intake row protected fields, even when the selection carries them', () => {
    const selectionWithProtectedFields = {
      ...FULL_SELECTION,
      pageUrl: 'https://jkanime.net/dr-stone/',
      folderPath: 'D:/Anime/Dr. Stone',
      episodesWatched: '5',
      estado: 'viendo',
      firstWatchDate: '2024-01-01',
    } as unknown as AnimeMetadataSelection;

    const patch = toIntakeMetadataPatch(selectionWithProtectedFields);

    expect(Object.keys(patch).sort()).toEqual([
      'coverURL',
      'duration',
      'genres',
      'kind',
      'name',
      'origin',
      'studios',
      'totalEpisodes',
    ]);
    expect(patch).not.toHaveProperty('pageUrl');
    expect(patch).not.toHaveProperty('folderPath');
  });
});

describe('formatAppliedMetadataFields', () => {
  it('labels exactly the fields the patch applied, in patch order', () => {
    expect(formatAppliedMetadataFields(['name', 'kind'])).toBe('Name, Type');
    expect(formatAppliedMetadataFields(['totalEpisodes', 'genres', 'coverURL'])).toBe('Episodes, Genres, Cover');
  });

  it('renders nothing for a patch that applied nothing', () => {
    expect(formatAppliedMetadataFields([])).toBe('');
  });
});

describe('toSeasonCreateMetadata', () => {
  it('converts a held patch into the create contract: numbers parsed, lists split, cover typed', () => {
    // toStrictEqual, not toEqual: a field the lookup did not confirm must be ABSENT
    // from the sent metadata, and toEqual treats { x: undefined } as equal to {}.
    expect(
      toSeasonCreateMetadata({ name: 'Dr. Stone', kind: '1', totalEpisodes: '24', duration: '45', origin: 'Manga', genres: 'Action, Fantasy', studios: 'Madhouse', coverURL: 'https://c.jpg' }),
    ).toStrictEqual({ kind: 1, totalEpisodes: 24, durationMinutes: 45, origin: 'Manga', genres: ['Action', 'Fantasy'], studios: ['Madhouse'], cover: { type: 'url', path: 'https://c.jpg' } });
  });

  it('never sends the confirmed title: the row raw name is the anime name', () => {
    expect(toSeasonCreateMetadata({ name: 'Dr. Stone' })).toStrictEqual({});
  });

  it('omits a field the lookup did not confirm instead of sending an empty or zero value', () => {
    expect(toSeasonCreateMetadata({ name: 'Dr. Stone', origin: 'Manga' })).toStrictEqual({ origin: 'Manga' });
  });

  it('omits a blank name the same way it omits every other blank field', () => {
    expect(toSeasonCreateMetadata({ name: '' })).toStrictEqual({});
    expect(toSeasonCreateMetadata({ name: '' , origin: 'Manga' })).toStrictEqual({ origin: 'Manga' });
  });

  it('drops values that do not parse rather than passing a NaN or a blank through', () => {
    expect(toSeasonCreateMetadata({ totalEpisodes: 'twenty-four', duration: '   ', genres: ' , ', origin: '', coverURL: '' })).toStrictEqual({});
    // A blank field must stay absent even when the blank carries whitespace, and a
    // padded number is still the number it reads as.
    expect(toSeasonCreateMetadata({ duration: ' 45 ' })).toStrictEqual({ durationMinutes: 45 });
  });
});

describe('buildSeasonCreateMetadata', () => {
  it('keeps only the rows being created', () => {
    const byRow = { 'sa-1': { origin: 'Manga' }, 'sa-2': { origin: 'Fantasy' } };

    expect(buildSeasonCreateMetadata(byRow, ['sa-2'])).toEqual({ 'sa-2': { origin: 'Fantasy' } });
  });

  it('is empty when no picked row ever confirmed a lookup', () => {
    expect(buildSeasonCreateMetadata({}, ['sa-1'])).toEqual({});
    expect(buildSeasonCreateMetadata({ 'sa-2': { origin: 'Fantasy' } }, ['sa-1'])).toEqual({});
  });
});


describe('toHeldMetadataPatch', () => {
  it('turns stored metadata back into the values the row shows', () => {
    expect(
      toHeldMetadataPatch({ kind: 2, totalEpisodes: 24, durationMinutes: 45, origin: 'Manga', genres: ['Action', 'Fantasy'], studios: ['Madhouse', 'CloverWorks'], cover: { type: 'url', path: 'https://c.jpg' } }),
    ).toStrictEqual({ kind: '2', totalEpisodes: '24', duration: '45', origin: 'Manga', genres: 'Action, Fantasy', studios: 'Madhouse, CloverWorks', coverURL: 'https://c.jpg' });
  });

  it('is undefined when the row stored nothing, and omits every blank field', () => {
    expect(toHeldMetadataPatch(undefined)).toBeUndefined();
    // toStrictEqual, not toEqual: a blank or absent field must be ABSENT from the
    // display patch, never present as an empty value.
    expect(toHeldMetadataPatch({ origin: '', cover: { type: 'url', path: '' } })).toStrictEqual({});
    expect(toHeldMetadataPatch({ kind: 0 })).toStrictEqual({ kind: '0' });
    expect(toHeldMetadataPatch({ genres: [] })).toStrictEqual({ genres: '' });
  });
});

describe('compactMetadataPatch', () => {
  it('drops blank and undefined entries and keeps the real values', () => {
    expect(compactMetadataPatch({ name: 'Dr. Stone', kind: undefined, genres: '', origin: 'Manga' })).toStrictEqual({ name: 'Dr. Stone', origin: 'Manga' });
    expect(compactMetadataPatch({ name: '', kind: undefined })).toStrictEqual({});
  });
});

describe('formatMetadataSummary', () => {
  it.each([
    {
      patch: { name: 'Dr. Stone', kind: '0', totalEpisodes: '12', duration: '24', genres: 'Action', studios: 'TMS' },
      summary: 'Anime (TV) · 12 eps · 24 min · TMS',
    },
    { patch: { kind: '3', duration: '45' }, summary: 'OVA · 45 min' },
    { patch: { kind: '7', totalEpisodes: '1' }, summary: '7 · 1 eps' },
    { patch: { totalEpisodes: '', studios: '' }, summary: '' },
    { patch: { name: 'Dr. Stone', origin: 'Manga' }, summary: '' },
  ])('summarizes $patch as "$summary"', ({ patch, summary }) => {
    expect(formatMetadataSummary(patch)).toBe(summary);
  });
});

describe('pickRowEntries', () => {
  it('keeps the record itself while every stored row is still shown, whatever the order', () => {
    const entries = { 'sa-1': 'one', 'sa-2': 'two' };

    expect(pickRowEntries(entries, new Set(['sa-2', 'sa-1', 'sa-3']))).toBe(entries);
  });

  it('drops the entries whose row left the list and keeps the rest', () => {
    const entries = { 'sa-1': 'one', 'sa-2': 'two' };

    expect(pickRowEntries(entries, new Set(['sa-2']))).toEqual({ 'sa-2': 'two' });
  });

  it('narrows every entry away when no row is left', () => {
    expect(pickRowEntries({ 'sa-1': 'one' }, new Set<string>())).toEqual({});
  });
});
