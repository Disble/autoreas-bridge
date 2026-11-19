import { describe, expect, it } from 'vitest';
import {
  applyRowPatch,
  buildAnimeCreateCommand,
  createAnimeCreateRow,
  parseOptionalCreateInt,
  rowHasData,
  splitCreateCommaList,
  validateAnimeCreateRows,
} from '../anime-create.helpers';

/** A complete, valid create row that each case patches to the shape it checks. */
const baseRow = {
  draftId: '__draft__:1',
  name: 'Frieren',
  page: 'https://example.test/frieren',
  folder: '',
  folderManual: false,
  kind: '0',
  episodesWatched: '',
  totalEpisodes: '',
  duration: '',
  origin: '',
  coverType: 'url',
  coverPath: '',
  genres: '',
  studios: '',
};

describe('anime-create.helpers', () => {
  it('creates an empty row defaulting to Anime (TV), url cover, and auto folder, and reports a row as having data only once the user entered something', () => {
    const row = createAnimeCreateRow(3);
    expect(row.draftId).toBe('__draft__:3');
    expect(row.name).toBe('');
    expect(row.kind).toBe('0');
    expect(row.coverType).toBe('url');
    expect(row.folderManual).toBe(false);

    expect(rowHasData(createAnimeCreateRow(1))).toBe(false);
    expect(rowHasData({ ...baseRow, name: '', page: '' })).toBe(false);
    expect(rowHasData({ ...baseRow, name: '', page: '', origin: 'Manga' })).toBe(true);
    expect(rowHasData({ ...baseRow, name: 'Frieren', page: '' })).toBe(true);
  });

  it('blocks submit for a missing name, a missing or invalid page, or no placement naming the row, and accepts a valid row without optional metadata', () => {
    const placed = { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] };
    expect(validateAnimeCreateRows([{ ...baseRow, name: '' }], placed)).toContain('name');
    expect(validateAnimeCreateRows([{ ...baseRow, page: '' }], placed)).toContain('page');
    // The download page must be a valid http(s) URL.
    expect(validateAnimeCreateRows([{ ...baseRow, page: 'jkanime.net/frieren' }], placed)).toContain('valid');

    const unplaced = validateAnimeCreateRows([baseRow], {});
    expect(unplaced).toContain('Frieren');
    expect(unplaced).toContain('placement');

    expect(validateAnimeCreateRows([baseRow], placed)).toBeUndefined();
  });

  it('builds one AnimeCreateItem per row, wiring placements from the partitioned submit and passing changed neighbors through untouched', () => {
    const rows = [baseRow];
    const command = buildAnimeCreateCommand(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] }, []);

    expect(command.creates).toEqual([
      { name: 'Frieren', page: 'https://example.test/frieren', placements: [{ day: 'Lunes', order: 1 }], kind: 0 },
    ]);
    expect(command.changedNeighbors).toEqual([]);

    const changedNeighbors = [{ animeId: 'existing-1', baseModifiedAt: 100, placements: [{ day: 'Lunes', order: 2 }] }];
    expect(buildAnimeCreateCommand(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] }, changedNeighbors).changedNeighbors).toEqual(changedNeighbors);
  });

  it('includes every optional field only when the row provides it', () => {
    const rows = [{
      ...baseRow,
      folder: 'D:/Anime/Frieren',
      kind: '0',
      episodesWatched: '2',
      totalEpisodes: '12',
      duration: '24',
      origin: 'Light novel',
      coverType: 'image',
      coverPath: 'D:/Anime/Frieren/cover.jpg',
      genres: 'Adventure, Drama',
      studios: 'Madhouse',
    }];
    const command = buildAnimeCreateCommand(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] }, []);

    expect(command.creates).toEqual([
      {
        name: 'Frieren',
        page: 'https://example.test/frieren',
        placements: [{ day: 'Lunes', order: 1 }],
        folder: 'D:/Anime/Frieren',
        kind: 0,
        episodesWatched: 2,
        totalEpisodes: 12,
        durationMinutes: 24,
        origin: 'Light novel',
        genres: ['Adventure', 'Drama'],
        studios: ['Madhouse'],
        cover: { type: 'image', path: 'D:/Anime/Frieren/cover.jpg' },
      },
    ]);
  });

  it('parses optional integers and splits comma lists', () => {
    expect(parseOptionalCreateInt('12')).toBe(12);
    expect(parseOptionalCreateInt('')).toBeUndefined();
    expect(parseOptionalCreateInt('  ')).toBeUndefined();
    expect(parseOptionalCreateInt('abc')).toBeUndefined();
    expect(splitCreateCommaList('Action,  Drama , ,Comedy')).toEqual(['Action', 'Drama', 'Comedy']);
    expect(splitCreateCommaList('')).toEqual([]);
  });

  it('auto-derives the folder from the name until the user overrides it', () => {
    const rows = [{ ...baseRow, name: '', folder: '', folderManual: false }];
    const named = applyRowPatch(rows, baseRow.draftId, { name: 'Frieren' }, 'D:\\Anime');
    expect(named[0].folder).toBe('D:\\Anime\\Frieren');
    expect(named[0].folderManual).toBe(false);

    const overridden = applyRowPatch(named, baseRow.draftId, { folder: 'D:\\Custom' }, 'D:\\Anime');
    expect(overridden[0].folderManual).toBe(true);

    const renamed = applyRowPatch(overridden, baseRow.draftId, { name: 'Bocchi' }, 'D:\\Anime');
    expect(renamed[0].folder).toBe('D:\\Custom');
  });
});
