import { describe, expect, it } from 'vitest';
import {
  buildAnimeCreateCommand,
  createAnimeCreateRow,
  validateAnimeCreateRows,
} from '../anime-create.helpers';

const baseRow = { draftId: '__draft__:1', name: 'Frieren', page: 'https://example.test/frieren', folder: '', kind: '', premieredAt: '' };

describe('anime-create.helpers', () => {
  it('creates an empty row with a synthetic draft id', () => {
    const row = createAnimeCreateRow(3);
    expect(row.draftId).toBe('__draft__:3');
    expect(row.name).toBe('');
    expect(row.page).toBe('');
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
      { name: 'Frieren', page: 'https://example.test/frieren', placements: [{ day: 'Lunes', order: 1 }] },
    ]);
    expect(command.changedNeighbors).toEqual([]);
  });

  it('includes optional metadata only when the row provides it', () => {
    const rows = [{ ...baseRow, folder: 'D:/Anime/Frieren', kind: '0', premieredAt: '1700000000000' }];
    const command = buildAnimeCreateCommand(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] }, []);

    expect(command.creates).toEqual([
      {
        name: 'Frieren',
        page: 'https://example.test/frieren',
        placements: [{ day: 'Lunes', order: 1 }],
        folder: 'D:/Anime/Frieren',
        kind: 0,
        premieredAt: 1700000000000,
      },
    ]);
  });

  it('passes through changed-neighbor entries untouched', () => {
    const rows = [baseRow];
    const changedNeighbors = [{ animeId: 'existing-1', baseModifiedAt: 100, placements: [{ day: 'Lunes', order: 2 }] }];
    const command = buildAnimeCreateCommand(rows, { [baseRow.draftId]: [{ day: 'Lunes', order: 1 }] }, changedNeighbors);

    expect(command.changedNeighbors).toEqual(changedNeighbors);
  });
});
