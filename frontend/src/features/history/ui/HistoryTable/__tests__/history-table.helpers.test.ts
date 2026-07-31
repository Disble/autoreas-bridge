import { describe, expect, it } from 'vitest';
import type { AnimeHistoryEntry } from '../../../../../shared/contracts/anime.types';
import {
  HISTORY_TABLE_ESTADO_ALL_VALUE,
  HISTORY_TABLE_SORT_FECHA_CREACION_VALUE,
  HISTORY_TABLE_SORT_NOMBRE_VALUE,
  HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE,
  HISTORY_TABLE_TIPO_ALL_VALUE,
} from '../history-table.constants';
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
  parseHistoryParams,
  serializeHistoryParams,
  sortHistoryEntries,
} from '../history-table.helpers';

// Tuesday, June 30, 2026, 12:12 local time (UTC-constructed so the fixture
// itself is timezone-safe; `Date` local getters below render it in whatever
// zone the test runner's machine is in).
const FIXED_TIMESTAMP = new Date(2026, 5, 30, 12, 12, 0).getTime();

function entry(overrides: Partial<AnimeHistoryEntry>): AnimeHistoryEntry {
  return {
    id: 'anime-1',
    name: 'Frieren',
    episodesWatched: 12,
    lastWatchedAt: FIXED_TIMESTAMP,
    status: 0,
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

  it.each([
    [new Date(2026, 5, 1, 8, 0, 0).getTime(), '29 days ago'],
    [new Date(2026, 4, 31, 8, 0, 0).getTime(), '1 month ago'],
    [new Date(2026, 2, 31, 8, 0, 0).getTime(), '2 months ago'],
    [new Date(2025, 6, 30, 8, 0, 0).getTime(), '11 months ago'],
    [new Date(2025, 5, 30, 8, 0, 0).getTime(), '1 year ago'],
    [new Date(2025, 4, 30, 8, 0, 0).getTime(), '1 year 1 month ago'],
    [new Date(2025, 3, 30, 8, 0, 0).getTime(), '1 year 2 months ago'],
    [new Date(2024, 5, 30, 8, 0, 0).getTime(), '2 years ago'],
    [new Date(2017, 11, 30, 8, 0, 0).getTime(), '8 years 6 months ago'],
  ])('formats long-running recency as %s', (millis, expected) => {
    const now = new Date(2026, 5, 30, 20, 0, 0).getTime();

    expect(formatHistoryRelativeRecency(millis, now)).toBe(expected);
  });
});

describe('getHistoryEstadoLabel', () => {
  it.each([
    [0, 'Viendo'],
    [1, 'Finalizado'],
    [2, 'No me gusto'],
    [3, 'En pausa'],
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
    entry({ id: 'a', name: 'Frieren', status: 0, kind: 0 }),
    entry({ id: 'b', name: 'Bocchi the Rock', status: 1, kind: 1 }),
    entry({ id: 'c', name: 'Zenshuu', status: 1, kind: 0 }),
    entry({ id: 'd', name: 'No Tipo', status: 1, kind: undefined }),
  ];

  it('returns every entry when the query is empty and both filters are "all"', () => {
    expect(filterHistoryEntries(entries, '', 'all', 'all')).toEqual(entries);
  });

  it('narrows by a case-insensitive name search', () => {
    expect(filterHistoryEntries(entries, 'frie', 'all', 'all').map((item) => item.id)).toEqual(['a']);
  });

  it('narrows by estado', () => {
    expect(filterHistoryEntries(entries, '', '1', 'all').map((item) => item.id)).toEqual(['b', 'c', 'd']);
  });

  it('narrows by tipo', () => {
    expect(filterHistoryEntries(entries, '', 'all', '0').map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('excludes entries with an absent tipo from any non-"all" tipo filter', () => {
    expect(filterHistoryEntries(entries, '', 'all', '1').map((item) => item.id)).toEqual(['b']);
  });

  it('composes search, estado, and tipo filters together', () => {
    expect(filterHistoryEntries(entries, 'zen', '1', '0').map((item) => item.id)).toEqual(['c']);
  });

  it('trims surrounding whitespace from the search query', () => {
    expect(filterHistoryEntries(entries, '  frie  ', 'all', 'all').map((item) => item.id)).toEqual(['a']);
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
    entry({ id: `anime-${index}`, name: `Anime ${index}` }),
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
      [entry({ id: 'anime-0', name: 'Anime 0', episodesWatched: 7, status: 1, lastWatchedAt: FIXED_TIMESTAMP })],
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

describe('sortHistoryEntries', () => {
  const entries = [
    entry({ id: 'b', name: 'Bocchi the Rock', createdAt: 100 }),
    entry({ id: 'a', name: 'Frieren', createdAt: 300 }),
    entry({ id: 'd', name: 'Zenshuu', createdAt: undefined }),
    entry({ id: 'c', name: 'Frieren', createdAt: 200 }),
  ];

  it('keeps the input (server) order for the default ult-cap-visto sort', () => {
    expect(sortHistoryEntries(entries, HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE).map((item) => item.id)).toEqual([
      'b',
      'a',
      'd',
      'c',
    ]);
  });

  it('sorts A-Z by nombre, breaking ties by id', () => {
    expect(sortHistoryEntries(entries, HISTORY_TABLE_SORT_NOMBRE_VALUE).map((item) => item.id)).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });

  it('sorts by fechaCreacion DESC, placing absent values last', () => {
    expect(sortHistoryEntries(entries, HISTORY_TABLE_SORT_FECHA_CREACION_VALUE).map((item) => item.id)).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
  });

  it('does not mutate the input array', () => {
    const original = [...entries];
    sortHistoryEntries(entries, HISTORY_TABLE_SORT_NOMBRE_VALUE);
    expect(entries).toEqual(original);
  });
});

describe('parseHistoryParams', () => {
  it('returns every default when the query string is empty', () => {
    expect(parseHistoryParams(new URLSearchParams(''))).toEqual({
      q: '',
      estado: HISTORY_TABLE_ESTADO_ALL_VALUE,
      tipo: HISTORY_TABLE_TIPO_ALL_VALUE,
      sort: HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE,
      page: 1,
    });
  });

  it('reads every recognized param', () => {
    expect(parseHistoryParams(new URLSearchParams('q=frie&estado=1&tipo=0&sort=nombre&page=3'))).toEqual({
      q: 'frie',
      estado: '1',
      tipo: '0',
      sort: HISTORY_TABLE_SORT_NOMBRE_VALUE,
      page: 3,
    });
  });

  it('falls back to defaults for invalid estado, tipo, and sort values', () => {
    expect(parseHistoryParams(new URLSearchParams('estado=bogus&tipo=bogus&sort=bogus'))).toEqual({
      q: '',
      estado: HISTORY_TABLE_ESTADO_ALL_VALUE,
      tipo: HISTORY_TABLE_TIPO_ALL_VALUE,
      sort: HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE,
      page: 1,
    });
  });

  it.each(['0', '-1', 'abc', ''])('falls back to page 1 for an invalid page value %s', (page) => {
    expect(parseHistoryParams(new URLSearchParams(`page=${page}`)).page).toBe(1);
  });
});

describe('serializeHistoryParams', () => {
  it('omits every param at its default value', () => {
    const params = serializeHistoryParams({
      q: '',
      estado: HISTORY_TABLE_ESTADO_ALL_VALUE,
      tipo: HISTORY_TABLE_TIPO_ALL_VALUE,
      sort: HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE,
      page: 1,
    });

    expect(Array.from(params.keys())).toEqual([]);
  });

  it('includes every non-default param', () => {
    const params = serializeHistoryParams({
      q: 'frie',
      estado: '1',
      tipo: '0',
      sort: HISTORY_TABLE_SORT_NOMBRE_VALUE,
      page: 3,
    });

    expect(params.get('q')).toBe('frie');
    expect(params.get('estado')).toBe('1');
    expect(params.get('tipo')).toBe('0');
    expect(params.get('sort')).toBe(HISTORY_TABLE_SORT_NOMBRE_VALUE);
    expect(params.get('page')).toBe('3');
  });

  it('round-trips through parseHistoryParams for a full non-default state', () => {
    const state = {
      q: 'frie',
      estado: '1',
      tipo: '0',
      sort: HISTORY_TABLE_SORT_FECHA_CREACION_VALUE,
      page: 5,
    };

    expect(parseHistoryParams(serializeHistoryParams(state))).toEqual(state);
  });
});
