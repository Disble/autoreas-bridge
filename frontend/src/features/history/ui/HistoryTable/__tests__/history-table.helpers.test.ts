import { describe, expect, it } from 'vitest';
import type { AnimeHistoryEntry } from '../../../../../shared/contracts/anime.types';
import {
  filterHistoryEntries,
  formatHistoryLongDate,
  formatHistoryRelativeRecency,
  formatHistoryTime,
  formatHistoryWeekday,
  getHistoryEstadoColor,
  getHistoryEstadoLabel,
  getHistoryTotalPages,
  paginateHistoryEntries,
} from '../history-table.helpers';

// Tuesday, June 30, 2026, 12:12 local time (UTC-constructed so the fixture
// itself is timezone-safe; `Date` local getters below render it in whatever
// zone the test runner's machine is in).
const FIXED_TIMESTAMP = new Date(2026, 5, 30, 12, 12, 0).getTime();

function entry(overrides: Partial<AnimeHistoryEntry>): AnimeHistoryEntry {
  return {
    id: 'anime-1',
    nombre: 'Frieren',
    nrocapvisto: 12,
    fechaUltCapVisto: FIXED_TIMESTAMP,
    estado: 0,
    ...overrides,
  };
}

describe('formatHistoryLongDate', () => {
  it('formats the millis as a long-form local date', () => {
    expect(formatHistoryLongDate(FIXED_TIMESTAMP)).toBe('June 30, 2026');
  });
});

describe('formatHistoryWeekday', () => {
  it('formats the millis as a local weekday name', () => {
    expect(formatHistoryWeekday(FIXED_TIMESTAMP)).toBe('Tuesday');
  });
});

describe('formatHistoryTime', () => {
  it('formats the millis as a local HH:MM time', () => {
    expect(formatHistoryTime(FIXED_TIMESTAMP)).toBe('12:12');
  });

  it('zero-pads single-digit hours and minutes', () => {
    const millis = new Date(2026, 5, 30, 3, 5, 0).getTime();

    expect(formatHistoryTime(millis)).toBe('03:05');
  });
});

describe('formatHistoryRelativeRecency', () => {
  it('returns "Today" when the timestamp is the same calendar day as now', () => {
    const now = new Date(2026, 5, 30, 20, 0, 0).getTime();

    expect(formatHistoryRelativeRecency(FIXED_TIMESTAMP, now)).toBe('Today');
  });

  it('returns "Yesterday" when the timestamp is exactly one calendar day before now', () => {
    const now = new Date(2026, 6, 1, 8, 0, 0).getTime();

    expect(formatHistoryRelativeRecency(FIXED_TIMESTAMP, now)).toBe('Yesterday');
  });

  it('returns "N days ago" for a handful of days back', () => {
    const now = new Date(2026, 6, 2, 8, 0, 0).getTime();

    expect(formatHistoryRelativeRecency(FIXED_TIMESTAMP, now)).toBe('2 days ago');
  });
});

describe('getHistoryEstadoLabel', () => {
  it.each([
    [0, 'Viendo'],
    [1, 'Finalizado'],
    [2, 'Abandonado'],
    [3, 'Pendiente'],
  ])('maps estado %i to %s', (estado, label) => {
    expect(getHistoryEstadoLabel(estado)).toBe(label);
  });

  it('falls back to the raw estado when the value is unknown', () => {
    expect(getHistoryEstadoLabel(99)).toBe('99');
  });
});

describe('getHistoryEstadoColor', () => {
  it.each([
    [0, 'accent'],
    [1, 'success'],
    [2, 'danger'],
    [3, 'warning'],
  ])('maps estado %i to the %s chip color', (estado, color) => {
    expect(getHistoryEstadoColor(estado)).toBe(color);
  });

  it('falls back to the default color for an unknown estado', () => {
    expect(getHistoryEstadoColor(99)).toBe('default');
  });
});

describe('filterHistoryEntries', () => {
  const entries = [
    entry({ id: 'a', nombre: 'Frieren', estado: 0 }),
    entry({ id: 'b', nombre: 'Bocchi the Rock', estado: 1 }),
    entry({ id: 'c', nombre: 'Zenshuu', estado: 1 }),
  ];

  it('returns every entry when the query is empty and estado filter is "all"', () => {
    expect(filterHistoryEntries(entries, '', 'all')).toEqual(entries);
  });

  it('narrows by a case-insensitive name search', () => {
    expect(filterHistoryEntries(entries, 'frie', 'all').map((item) => item.id)).toEqual(['a']);
  });

  it('narrows by estado', () => {
    expect(filterHistoryEntries(entries, '', '1').map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('composes search and estado filters together', () => {
    expect(filterHistoryEntries(entries, 'zen', '1').map((item) => item.id)).toEqual(['c']);
  });

  it('trims surrounding whitespace from the search query', () => {
    expect(filterHistoryEntries(entries, '  frie  ', 'all').map((item) => item.id)).toEqual(['a']);
  });
});

describe('getHistoryTotalPages', () => {
  it('returns 1 for an empty list', () => {
    expect(getHistoryTotalPages(0, 10)).toBe(1);
  });

  it('rounds up partial pages', () => {
    expect(getHistoryTotalPages(11, 10)).toBe(2);
  });

  it('returns exact page count for an even multiple', () => {
    expect(getHistoryTotalPages(20, 10)).toBe(2);
  });
});

describe('paginateHistoryEntries', () => {
  const entries = Array.from({ length: 25 }, (_, index) =>
    entry({ id: `anime-${index}`, nombre: `Anime ${index}` }),
  );

  it('slices the first page and assigns row numbers starting at 1', () => {
    const rows = paginateHistoryEntries(entries, 1, 10);

    expect(rows).toHaveLength(10);
    expect(rows[0]?.rowNumber).toBe(1);
    expect(rows[0]?.id).toBe('anime-0');
    expect(rows[9]?.rowNumber).toBe(10);
  });

  it('continues row numbering across pages instead of resetting', () => {
    const rows = paginateHistoryEntries(entries, 2, 10);

    expect(rows).toHaveLength(10);
    expect(rows[0]?.rowNumber).toBe(11);
    expect(rows[0]?.id).toBe('anime-10');
    expect(rows[9]?.rowNumber).toBe(20);
  });

  it('slices a partial final page', () => {
    const rows = paginateHistoryEntries(entries, 3, 10);

    expect(rows).toHaveLength(5);
    expect(rows[0]?.rowNumber).toBe(21);
    expect(rows[4]?.rowNumber).toBe(25);
  });

  it('builds the full row view model from a single entry', () => {
    const [row] = paginateHistoryEntries(
      [entry({ id: 'anime-0', nombre: 'Anime 0', nrocapvisto: 7, estado: 1, fechaUltCapVisto: FIXED_TIMESTAMP })],
      1,
      10,
    );

    expect(row).toEqual({
      id: 'anime-0',
      rowNumber: 1,
      nombre: 'Anime 0',
      nrocapvisto: 7,
      longDateLabel: 'June 30, 2026',
      weekdayLabel: 'Tuesday',
      timeLabel: '12:12',
      relativeRecencyLabel: formatHistoryRelativeRecency(FIXED_TIMESTAMP),
      estado: 1,
      estadoLabel: 'Finalizado',
      estadoColor: 'success',
    });
  });
});

describe('getHistoryPageItems', () => {
  it('returns every page without ellipsis when there are 7 pages or fewer', async () => {
    const { getHistoryPageItems } = await import('../history-table.helpers');
    expect(getHistoryPageItems(1, 1)).toEqual([1]);
    expect(getHistoryPageItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getHistoryPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('windows the middle with ellipsis on both sides', async () => {
    const { getHistoryPageItems } = await import('../history-table.helpers');
    expect(getHistoryPageItems(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
  });

  it('keeps the start contiguous when the current page is near the beginning', async () => {
    const { getHistoryPageItems } = await import('../history-table.helpers');
    expect(getHistoryPageItems(2, 10)).toEqual([1, 2, 3, 'ellipsis', 10]);
  });

  it('keeps the end contiguous when the current page is near the end', async () => {
    const { getHistoryPageItems } = await import('../history-table.helpers');
    expect(getHistoryPageItems(9, 10)).toEqual([1, 'ellipsis', 8, 9, 10]);
  });
});
