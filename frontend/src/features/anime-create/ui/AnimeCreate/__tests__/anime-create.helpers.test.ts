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
  it('creates an empty row defaulting to Anime (TV), url cover, and auto folder', () => {
    const row = createAnimeCreateRow(3);
    expect(row.draftId).toBe('__draft__:3');
    expect(row.name).toBe('');
    expect(row.kind).toBe('0');
    expect(row.coverType).toBe('url');
    expect(row.folderManual).toBe(false);
  });

  it('blocks submit when a row is missing its name', () => {
    const rows = [{ ...baseRow, name: '' }];
    const message = validateAnimeCreateRows(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] });
    expect(message).toContain('name');
  });

  it('blocks submit when a row is missing its page', () => {
    const rows = [{ ...baseRow, page: '' }];
    const message = validateAnimeCreateRows(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] });
    expect(message).toContain('page');
  });

  it('blocks submit when the download page is not a valid http(s) URL', () => {
    const rows = [{ ...baseRow, page: 'jkanime.net/frieren' }];
    const message = validateAnimeCreateRows(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] });
    expect(message).toContain('valid');
  });

  it('blocks submit when a row has no schedule placement, naming the row', () => {
    const rows = [baseRow];
    const message = validateAnimeCreateRows(rows, {});
    expect(message).toContain('Frieren');
    expect(message).toContain('placement');
  });

  it('accepts a fully valid single row without any optional metadata', () => {
    const rows = [baseRow];
    const message = validateAnimeCreateRows(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] });
    expect(message).toBeUndefined();
  });

  it('builds one AnimeCreateItem per row, wiring placements from the partitioned submit', () => {
    const rows = [baseRow];
    const command = buildAnimeCreateCommand(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] }, []);

    expect(command.creates).toEqual([
      { name: 'Frieren', page: 'https://example.test/frieren', placements: [{ day: 'Lunes', order: 1 }], kind: 0 },
    ]);
    expect(command.changedNeighbors).toEqual([]);
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

  it('reports a row as having data only when the user entered something', () => {
    expect(rowHasData(createAnimeCreateRow(1))).toBe(false);
    expect(rowHasData({ ...baseRow, name: '', page: '' })).toBe(false);
    expect(rowHasData({ ...baseRow, name: '', page: '', origin: 'Manga' })).toBe(true);
    expect(rowHasData({ ...baseRow, name: 'Frieren', page: '' })).toBe(true);
  });

  it('passes through changed-neighbor entries untouched', () => {
    const rows = [baseRow];
    const changedNeighbors = [{ animeId: 'existing-1', baseModifiedAt: 100, placements: [{ day: 'Lunes', order: 2 }] }];
    const command = buildAnimeCreateCommand(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] }, changedNeighbors);

    expect(command.changedNeighbors).toEqual(changedNeighbors);
  });
});
