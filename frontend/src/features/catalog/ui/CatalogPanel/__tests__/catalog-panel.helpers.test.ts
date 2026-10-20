import { describe, expect, it } from 'vitest';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import { CATALOG_DEFAULT_CRITERIA } from '../catalog-panel.constants';
import {
  classifyCatalogEmptyState,
  compareCatalogAnimes,
  countActiveCatalogFilters,
  filterCatalogAnimes,
  getCatalogGenreOptions,
  getCatalogStatusColor,
  isCatalogSortKey,
  removeCatalogCriterion,
  removeCatalogCriterionChips,
  formatCatalogFiltersLabel,
  formatCatalogFooter,
  formatCatalogShowLabel,
  toCatalogChoice,
  toCatalogCover,
  toCatalogCriterionChips,
  toCatalogDetailPath,
  toCatalogGenres,
  toCatalogItemViewModel,
  toCatalogSortKey,
  toCatalogView,
} from '../catalog-panel.helpers';
import type { CatalogCriteria } from '../catalog-panel.types';

/** Baseline catalog record each case overrides a few fields of. */
const baseAnime: Anime = {
  id: 'anime-1',
  name: 'Frieren',
  status: 1,
  episodesWatched: 12,
  totalEpisodes: 28,
  active: 1,
  kind: 0,
  days: [],
  genres: ['Adventure', 'Drama'],
  hasDownloadPage: true,
  hasFolder: true,
  hasCover: true,
};

/** Builds a record from the baseline with the given overrides. */
function anime(overrides: Partial<Anime>): Anime {
  return { ...baseAnime, ...overrides };
}

/** Builds criteria from the all-records default with the given overrides. */
function criteria(overrides: Partial<CatalogCriteria>): CatalogCriteria {
  return { ...CATALOG_DEFAULT_CRITERIA, ...overrides };
}

/** Names of the records in the order a sort produced. */
function namesSortedBy(sort: string, items: readonly Anime[]): readonly string[] {
  if (!isCatalogSortKey(sort)) {
    throw new Error(`unknown sort ${sort}`);
  }
  return items.toSorted(compareCatalogAnimes(sort)).map((item) => item.name);
}

describe('filterCatalogAnimes', () => {
  const items = [
    anime({ id: 'a', name: 'Dandadan', status: 0, kind: 0, genres: ['Action', 'Comedy'] }),
    anime({ id: 'b', name: 'Kimi no Na wa.', status: 1, kind: 1, genres: ['Drama', 'Romance'] }),
    anime({ id: 'c', name: 'Dungeon Meshi', status: 1, kind: 0, genres: ['Adventure', 'Comedy'] }),
  ];

  /** Ids of the records the criteria keep. */
  const idsMatching = (overrides: Partial<CatalogCriteria>) =>
    filterCatalogAnimes(items, criteria(overrides)).map((item) => item.id);

  it('keeps every record under the all-records default', () => {
    expect(idsMatching({})).toEqual(['a', 'b', 'c']);
  });

  it('matches a trimmed query against the name case-insensitively', () => {
    expect(idsMatching({ query: '  DUN ' })).toEqual(['c']);
  });

  it('matches the selected status and type', () => {
    expect(idsMatching({ status: '1' })).toEqual(['b', 'c']);
    expect(idsMatching({ kind: '1' })).toEqual(['b']);
    expect(idsMatching({ status: '1', kind: '0' })).toEqual(['c']);
  });

  it('keeps only records that carry every selected genre, case-insensitively', () => {
    expect(idsMatching({ genres: ['comedy'] })).toEqual(['a', 'c']);
    expect(idsMatching({ genres: ['Comedy', 'Adventure'] })).toEqual(['c']);
  });
});

describe('compareCatalogAnimes', () => {
  it('orders names A–Z numerically and case-insensitively, and Z–A in reverse', () => {
    const items = [
      anime({ id: '1', name: 'episode 10' }),
      anime({ id: '2', name: 'Episode 9' }),
      anime({ id: '3', name: 'alpha' }),
    ];

    expect(namesSortedBy('name-asc', items)).toEqual(['alpha', 'Episode 9', 'episode 10']);
    expect(namesSortedBy('name-desc', items)).toEqual(['episode 10', 'Episode 9', 'alpha']);
  });

  it.each([
    [['b', 'a']],
    [['a', 'b']],
  ])('breaks a name tie by id so the order is stable, from %j', (ids) => {
    const items = ids.map((id) => anime({ id, name: id === 'a' ? 'same' : 'Same' }));

    expect(items.toSorted(compareCatalogAnimes('name-asc')).map((item) => item.id)).toEqual(['a', 'b']);
    expect(compareCatalogAnimes('name-asc')(items[0], items[0])).toBe(0);
  });

  it('orders by status Viendo, Finalizado, En pausa, No me gusto, then name', () => {
    const items = [
      anime({ id: '1', name: 'Dropped', status: 2 }),
      anime({ id: '2', name: 'Paused', status: 3 }),
      anime({ id: '3', name: 'Zeta done', status: 1 }),
      anime({ id: '4', name: 'Alpha done', status: 1 }),
      anime({ id: '5', name: 'Watching', status: 0 }),
      anime({ id: '6', name: 'Unknown', status: 9 }),
    ];

    expect(namesSortedBy('status', items)).toEqual(['Watching', 'Alpha done', 'Zeta done', 'Paused', 'Dropped', 'Unknown']);
  });

  it('orders by type value, a missing type last, then name', () => {
    const items = [
      anime({ id: '1', name: 'No type', kind: undefined }),
      anime({ id: '2', name: 'Movie', kind: 1 }),
      anime({ id: '3', name: 'Series B', kind: 0 }),
      anime({ id: '4', name: 'Series A', kind: 0 }),
      anime({ id: '5', name: 'An OVA', kind: 3 }),
      anime({ id: '6', name: 'Special', kind: 2 }),
    ];

    expect(namesSortedBy('kind', items)).toEqual(['Series A', 'Series B', 'Movie', 'Special', 'An OVA', 'No type']);
  });
});

describe('isCatalogSortKey', () => {
  it('accepts only the four sort keys', () => {
    expect(['name-asc', 'name-desc', 'status', 'kind'].every(isCatalogSortKey)).toBe(true);
    expect(isCatalogSortKey('year-desc')).toBe(false);
  });
});

describe('toCatalogSortKey and toCatalogView', () => {
  it('apply a known key and keep the current value for anything else', () => {
    expect(toCatalogSortKey('kind', 'name-asc')).toBe('kind');
    expect(toCatalogSortKey('year-desc', 'status')).toBe('status');
    expect(toCatalogSortKey(null, 'status')).toBe('status');
    expect(toCatalogView(new Set(['list']), 'grid')).toBe('list');
    expect(toCatalogView(new Set(['grid']), 'list')).toBe('grid');
    expect(toCatalogView(new Set(['table']), 'grid')).toBe('grid');
    expect(toCatalogView(new Set(), 'list')).toBe('list');
  });
});

describe('countActiveCatalogFilters', () => {
  it('counts status, type and each genre, but never the search', () => {
    expect(countActiveCatalogFilters(criteria({ query: 'x' }))).toBe(0);
    expect(countActiveCatalogFilters(criteria({ status: '0', kind: '3', genres: ['Drama', 'Mecha'] }))).toBe(4);
  });
});

describe('toCatalogCriterionChips', () => {
  it('names every active filter with its group and canonical label', () => {
    const chips = toCatalogCriterionChips(criteria({ query: 'x', status: '3', kind: '3', genres: ['Drama'] }));

    expect(chips).toEqual([
      { id: 'status', field: 'status', value: '3', groupLabel: 'Status', valueLabel: 'En pausa' },
      { id: 'kind', field: 'kind', value: '3', groupLabel: 'Type', valueLabel: 'OVA' },
      { id: 'genre:Drama', field: 'genres', value: 'Drama', groupLabel: 'Genre', valueLabel: 'Drama' },
    ]);
  });

  it('produces no chip under the all-records default', () => {
    expect(toCatalogCriterionChips(CATALOG_DEFAULT_CRITERIA)).toEqual([]);
  });
});

describe('removeCatalogCriterion', () => {
  const active = criteria({ query: 'x', status: '0', kind: '1', genres: ['Drama', 'Mecha'] });
  const chips = toCatalogCriterionChips(active);

  it('returns a single-choice filter to all and keeps the rest', () => {
    expect(removeCatalogCriterion(active, chips[0])).toEqual({ ...active, status: 'all' });
    expect(removeCatalogCriterion(active, chips[1])).toEqual({ ...active, kind: 'all' });
  });

  it('removes only the chip genre', () => {
    expect(removeCatalogCriterion(active, chips[3])).toEqual({ ...active, genres: ['Drama'] });
  });

  it('removes every chip named by id at once, ignoring unknown ids', () => {
    expect(removeCatalogCriterionChips(active, chips, new Set(['kind', 'genre:Drama', 'nope']))).toEqual({ ...active, kind: 'all', genres: ['Mecha'] });
  });
});

describe('toCatalogChoice', () => {
  it('takes the selected key, and keeps the current choice for an empty or select-all selection', () => {
    expect(toCatalogChoice(new Set(['1']), 'all')).toBe('1');
    expect(toCatalogChoice(new Set([3]), 'all')).toBe('3');
    expect(toCatalogChoice(new Set(), '2')).toBe('2');
    expect(toCatalogChoice('all', '2')).toBe('2');
  });
});

describe('toCatalogGenres', () => {
  it('takes every selected genre in selection order, and keeps the current ones for select-all', () => {
    expect(toCatalogGenres(new Set(['Mecha', 'Drama']), ['Drama'])).toEqual(['Mecha', 'Drama']);
    expect(toCatalogGenres(new Set(), ['Drama'])).toEqual([]);
    expect(toCatalogGenres('all', ['Drama'])).toEqual(['Drama']);
  });
});

describe('getCatalogGenreOptions', () => {
  it('lists each trimmed genre once, alphabetically', () => {
    const items = [anime({ genres: ['Drama', ' Action '] }), anime({ genres: ['Action', ''] })];

    expect(getCatalogGenreOptions(items)).toEqual([
      { value: 'Action', label: 'Action' },
      { value: 'Drama', label: 'Drama' },
    ]);
  });
});

describe('getCatalogStatusColor', () => {
  it('draws each estado with its own color and an unknown one as default', () => {
    expect([0, 1, 2, 3, 7].map(getCatalogStatusColor)).toEqual(['accent', 'success', 'danger', 'warning', 'default']);
  });
});

describe('toCatalogItemViewModel', () => {
  it('maps the record to the labels a card and a row render', () => {
    expect(toCatalogItemViewModel(anime({ status: 3, kind: 1, genres: ['Drama', 'Romance'] }))).toEqual({
      id: 'anime-1',
      name: 'Frieren',
      hasCover: true,
      statusLabel: 'En pausa',
      statusColor: 'warning',
      kindLabel: 'Película',
      listMeta: 'Película · Drama, Romance',
    });
  });

  it('keeps the list meta to the type when the record has no genres', () => {
    expect(toCatalogItemViewModel(anime({ genres: [] })).listMeta).toBe('Anime (TV)');
  });
});

describe('catalog paths and footer', () => {
  it('links an anime to its detail and counts the hidden rest', () => {
    expect(toCatalogDetailPath('abc')).toBe('/catalog/detail/abc');
    expect(formatCatalogFooter(20, 36)).toBe('Showing 20 of 36 — scroll for more');
    expect(formatCatalogFooter(36, 36)).toBe('End of catalog');
    expect(formatCatalogShowLabel(7)).toBe('Show 7 anime');
    expect(formatCatalogFiltersLabel(0)).toBe('Filters');
    expect(formatCatalogFiltersLabel(2)).toBe('Filters, 2 active');
  });
});

describe('toCatalogCover', () => {
  const resolving = { hasCover: true, entry: undefined, hasFailed: false, canResolve: true };

  it('draws the poster for a record without a stored cover, whatever the cache holds', () => {
    expect(toCatalogCover({ ...resolving, hasCover: false, entry: { status: 'cover', dataUrl: 'data:a' } })).toEqual({ status: 'placeholder' });
  });

  it('draws a skeleton until the lookup answers, never the poster first', () => {
    expect(toCatalogCover(resolving)).toEqual({ status: 'loading' });
    expect(toCatalogCover({ ...resolving, entry: { status: 'loading' } })).toEqual({ status: 'loading' });
  });

  it('draws the resolved image', () => {
    expect(toCatalogCover({ ...resolving, entry: { status: 'cover', dataUrl: 'data:a' } })).toEqual({ status: 'cover', src: 'data:a' });
  });

  it('draws the poster when the binding is absent, answered placeholder, or the image failed', () => {
    expect(toCatalogCover({ ...resolving, canResolve: false })).toEqual({ status: 'placeholder' });
    expect(toCatalogCover({ ...resolving, entry: { status: 'placeholder' } })).toEqual({ status: 'placeholder' });
    expect(toCatalogCover({ ...resolving, entry: { status: 'cover', dataUrl: 'data:a' }, hasFailed: true })).toEqual({ status: 'placeholder' });
  });
});

describe('classifyCatalogEmptyState', () => {
  const resolved = { isLoading: false, hasError: false, sourceCount: 3, visibleCount: 0, criteria: criteria({ status: '1' }) };

  it('classifies nothing while the request is unresolved or failed', () => {
    expect(classifyCatalogEmptyState({ ...resolved, isLoading: true })).toBe('none');
    expect(classifyCatalogEmptyState({ ...resolved, hasError: true })).toBe('none');
  });

  it('classifies a resolved catalog with no anime as actually empty', () => {
    expect(classifyCatalogEmptyState({ ...resolved, sourceCount: 0 })).toBe('actual');
  });

  it('classifies visible rows as not empty, even while criteria are active', () => {
    expect(classifyCatalogEmptyState({ ...resolved, visibleCount: 1 })).toBe('none');
  });

  it.each([
    ['a query', { query: 'zzz' }],
    ['a status', { status: '1' }],
    ['a type', { kind: '2' }],
    ['a genre', { genres: ['Drama'] }],
  ])('classifies zero visible rows under %s as criteria-empty', (_name, overrides) => {
    expect(classifyCatalogEmptyState({ ...resolved, criteria: criteria(overrides) })).toBe('criteria');
  });

  it('refuses to call zero visible rows criteria-empty when only whitespace is searched', () => {
    expect(classifyCatalogEmptyState({ ...resolved, criteria: criteria({ query: '   ' }) })).toBe('none');
  });
});
