import { describe, expect, it } from 'vitest';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import {
  classifyCatalogEmptyState,
  filterAnimes,
  formatAnimeProgress,
  matchesAnimeGap,
  sortAnimesByName,
  toAnimeStatus,
  toAnimeViewModel,
} from '../catalog-panel.helpers';
import { ANIME_FILTER_ALL_VALUE, ANIME_GAP_COMPLETE_VALUE, ANIME_GAP_MISSING_VALUE } from '../catalog-panel.constants';

/** Baseline catalog record each case mutates one field of. */
const baseAnime: Anime = {
  id: 'anime-1',
  name: 'Frieren',
  status: 2,
  episodesWatched: 12,
  totalEpisodes: 28,
  active: 1,
  days: [],
  genres: [],
  hasDownloadPage: true,
  hasFolder: true,
};

describe('toAnimeStatus', () => {
  it('returns active when activo is 1', () => {
    expect(toAnimeStatus(1)).toBe('active');
  });

  it('returns inactive when activo is 0', () => {
    expect(toAnimeStatus(0)).toBe('inactive');
  });

  it('returns inactive for any non-1 value', () => {
    expect(toAnimeStatus(2)).toBe('inactive');
  });
});

describe('formatAnimeProgress', () => {
  it('includes totalcap when present', () => {
    expect(formatAnimeProgress(12, 28)).toBe('12 / 28');
  });

  it('shows a placeholder when totalcap is missing', () => {
    expect(formatAnimeProgress(5)).toBe('5 / ?');
  });
});

describe('toAnimeViewModel', () => {
  it('maps an active anime to the view model', () => {
    const viewModel = toAnimeViewModel(baseAnime);

    expect(viewModel).toEqual({
      id: 'anime-1',
      nombre: 'Frieren',
      estado: 2,
      progressLabel: '12 / 28',
      status: 'active',
      statusLabel: 'Active',
      hasDownloadPage: true,
      hasFolder: true,
      hasDownloadGap: false,
      gapLabel: undefined,
    });
  });

  it('maps an inactive anime to the view model', () => {
    const viewModel = toAnimeViewModel({ ...baseAnime, active: 0 });

    expect(viewModel.status).toBe('inactive');
    expect(viewModel.statusLabel).toBe('Inactive');
  });

  it('flags a download gap when the page is missing', () => {
    const viewModel = toAnimeViewModel({ ...baseAnime, hasDownloadPage: false });

    expect(viewModel.hasDownloadGap).toBe(true);
    expect(viewModel.gapLabel).toBe('Missing page');
  });

  it('flags a download gap when the folder is missing', () => {
    const viewModel = toAnimeViewModel({ ...baseAnime, hasFolder: false });

    expect(viewModel.hasDownloadGap).toBe(true);
    expect(viewModel.gapLabel).toBe('Missing folder');
  });

  it('flags a download gap mentioning both when page and folder are missing', () => {
    const viewModel = toAnimeViewModel({ ...baseAnime, hasDownloadPage: false, hasFolder: false });

    expect(viewModel.hasDownloadGap).toBe(true);
    expect(viewModel.gapLabel).toBe('Missing page & folder');
  });

  it('has no gap label when both page and folder are present', () => {
    const viewModel = toAnimeViewModel(baseAnime);

    expect(viewModel.hasDownloadGap).toBe(false);
    expect(viewModel.gapLabel).toBeUndefined();
  });
});

describe('matchesAnimeGap', () => {
  const complete = { ...baseAnime };
  const missingPage = { ...baseAnime, hasDownloadPage: false };

  it('matches everything when the filter is "all"', () => {
    expect(matchesAnimeGap(complete, ANIME_FILTER_ALL_VALUE)).toBe(true);
    expect(matchesAnimeGap(missingPage, ANIME_FILTER_ALL_VALUE)).toBe(true);
  });

  it('matches only animes missing a page or folder when filter is "missing"', () => {
    expect(matchesAnimeGap(missingPage, ANIME_GAP_MISSING_VALUE)).toBe(true);
    expect(matchesAnimeGap(complete, ANIME_GAP_MISSING_VALUE)).toBe(false);
  });

  it('matches only animes with both page and folder when filter is "complete"', () => {
    expect(matchesAnimeGap(complete, ANIME_GAP_COMPLETE_VALUE)).toBe(true);
    expect(matchesAnimeGap(missingPage, ANIME_GAP_COMPLETE_VALUE)).toBe(false);
  });
});

describe('filterAnimes', () => {
  const actionAnime: Anime = {
    ...baseAnime,
    id: 'action',
    name: '  Solo Leveling  ',
    status: 1,
    active: 1,
    kind: 2,
    days: ['Friday'],
    genres: ['Action'],
  };

  const dramaAnime: Anime = {
    ...baseAnime,
    id: 'drama',
    name: 'Violet Evergarden',
    status: 2,
    active: 0,
    kind: 3,
    days: ['Sunday'],
    genres: ['Drama'],
  };

  it('filters by trimmed query plus estado, activo, and tipo values', () => {
    const result = filterAnimes([actionAnime, dramaAnime], {
      query: '  solo LEVELING ',
      estado: '1',
      activo: '1',
      tipo: '2',
      dia: ANIME_FILTER_ALL_VALUE,
      generos: [],
      gap: ANIME_FILTER_ALL_VALUE,
    });

    expect(result).toEqual([actionAnime]);
  });

  it('keeps every item when query is blank and the select filters stay on all', () => {
    const result = filterAnimes([actionAnime, dramaAnime], {
      query: '   ',
      estado: ANIME_FILTER_ALL_VALUE,
      activo: ANIME_FILTER_ALL_VALUE,
      tipo: ANIME_FILTER_ALL_VALUE,
      dia: ANIME_FILTER_ALL_VALUE,
      generos: [],
      gap: ANIME_FILTER_ALL_VALUE,
    });

    expect(result).toEqual([actionAnime, dramaAnime]);
  });

  it('filters by day and genres case-insensitively', () => {
    const result = filterAnimes([actionAnime, dramaAnime], {
      query: '',
      estado: ANIME_FILTER_ALL_VALUE,
      activo: ANIME_FILTER_ALL_VALUE,
      tipo: ANIME_FILTER_ALL_VALUE,
      dia: 'friday',
      generos: ['action'],
      gap: ANIME_FILTER_ALL_VALUE,
    });

    expect(result).toEqual([actionAnime]);
  });
});

describe('sortAnimesByName', () => {
  it('sorts by name ascending', () => {
    const a: Anime = { ...baseAnime, id: 'a', name: 'Zeta' };
    const b: Anime = { ...baseAnime, id: 'b', name: 'Alpha' };

    expect([a, b].sort(sortAnimesByName).map((item) => item.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('uses id as tie-breaker when names match', () => {
    const a: Anime = { ...baseAnime, id: 'b', name: 'Same' };
    const b: Anime = { ...baseAnime, id: 'a', name: 'Same' };

    expect([a, b].sort(sortAnimesByName).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('returns zero when both name and id match', () => {
    const a: Anime = { ...baseAnime, id: 'same-id', name: 'Same' };
    const b: Anime = { ...baseAnime, id: 'same-id', name: 'Same' };

    expect(sortAnimesByName(a, b)).toBe(0);
  });

  it('is case-insensitive', () => {
    const a: Anime = { ...baseAnime, id: 'a', name: 'alpha' };
    const b: Anime = { ...baseAnime, id: 'b', name: 'BETA' };

    expect([b, a].sort(sortAnimesByName).map((item) => item.name)).toEqual(['alpha', 'BETA']);
  });
});

describe('classifyCatalogEmptyState', () => {
  /** All-records defaults: nothing the user could clear is active. */
  const defaultFilters = { query: '', estado: 'all', activo: 'all', tipo: 'all', dia: 'all', generos: [], gap: 'all' } as const;

  /** Baseline: a resolved catalog holding rows, unnarrowed and unbroken. */
  const resolved = { isLoading: false, hasError: false, sourceCount: 2, visibleCount: 2, filters: defaultFilters } as const;

  it('classifies nothing while the request is unresolved', () => {
    expect(classifyCatalogEmptyState({ ...resolved, isLoading: true, sourceCount: 0, visibleCount: 0 })).toBe('none');
  });

  it('classifies nothing when the request failed, so an error never reads as an empty catalog', () => {
    expect(classifyCatalogEmptyState({ ...resolved, hasError: true, sourceCount: 0, visibleCount: 0 })).toBe('none');
  });

  it('classifies a resolved catalog with no anime as actually empty', () => {
    expect(classifyCatalogEmptyState({ ...resolved, sourceCount: 0, visibleCount: 0 })).toBe('actual');
  });

  it('classifies visible rows as not empty at all', () => {
    expect(classifyCatalogEmptyState(resolved)).toBe('none');
  });

  it('classifies zero visible rows under an active filter as criteria-empty', () => {
    expect(classifyCatalogEmptyState({ ...resolved, visibleCount: 0, filters: { ...defaultFilters, tipo: 'Serie' } })).toBe('criteria');
  });

  it('classifies zero visible rows under a selected genre as criteria-empty', () => {
    expect(classifyCatalogEmptyState({ ...resolved, visibleCount: 0, filters: { ...defaultFilters, generos: ['Action'] } })).toBe('criteria');
  });

  it('refuses to call zero visible rows criteria-empty when no criteria are active', () => {
    expect(classifyCatalogEmptyState({ ...resolved, visibleCount: 0 })).toBe('none');
  });
});

describe('classifyCatalogEmptyState criteria detection', () => {
  /** All-records defaults: nothing the user could clear is active. */
  const noCriteria = { query: '', estado: 'all', activo: 'all', tipo: 'all', dia: 'all', generos: [], gap: 'all' } as const;

  /** A resolved catalog holding rows, with every row currently hidden. */
  const filteredAway = { isLoading: false, hasError: false, sourceCount: 2, visibleCount: 0 } as const;

  it.each([
    ['a search query', { query: 'alpha' }],
    ['an estado filter', { estado: '2' }],
    ['an activo filter', { activo: '1' }],
    ['a tipo filter', { tipo: 'Serie' }],
    ['a dia filter', { dia: 'Lunes' }],
    ['a gap filter', { gap: 'missing' }],
    ['a selected genre', { generos: ['Action'] }],
  ])('treats %s on its own as active criteria', (_label, override) => {
    expect(classifyCatalogEmptyState({ ...filteredAway, filters: { ...noCriteria, ...override } })).toBe('criteria');
  });

  it('treats a whitespace-only query as no criteria at all', () => {
    expect(classifyCatalogEmptyState({ ...filteredAway, filters: { ...noCriteria, query: '   ' } })).toBe('none');
  });

  it('keeps visible rows out of every empty state even while criteria are active', () => {
    expect(classifyCatalogEmptyState({ ...filteredAway, visibleCount: 1, filters: { ...noCriteria, query: 'alpha' } })).toBe('none');
  });
});
