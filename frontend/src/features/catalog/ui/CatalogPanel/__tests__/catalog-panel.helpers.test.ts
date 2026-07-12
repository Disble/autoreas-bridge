import { describe, expect, it } from 'vitest';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import {
  filterAnimes,
  formatAnimeProgress,
  matchesAnimeGap,
  sortAnimesByName,
  toAnimeStatus,
  toAnimeViewModel,
} from '../catalog-panel.helpers';
import { ANIME_FILTER_ALL_VALUE, ANIME_GAP_COMPLETE_VALUE, ANIME_GAP_MISSING_VALUE } from '../catalog-panel.constants';

const baseAnime: Anime = {
  id: 'anime-1',
  nombre: 'Frieren',
  estado: 2,
  nrocapvisto: 12,
  totalcap: 28,
  activo: 1,
  dias: [],
  generos: [],
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
    const viewModel = toAnimeViewModel({ ...baseAnime, activo: 0 });

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
    nombre: '  Solo Leveling  ',
    estado: 1,
    activo: 1,
    tipo: 2,
    dias: ['Friday'],
    generos: ['Action'],
  };

  const dramaAnime: Anime = {
    ...baseAnime,
    id: 'drama',
    nombre: 'Violet Evergarden',
    estado: 2,
    activo: 0,
    tipo: 3,
    dias: ['Sunday'],
    generos: ['Drama'],
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
    const a: Anime = { ...baseAnime, id: 'a', nombre: 'Zeta' };
    const b: Anime = { ...baseAnime, id: 'b', nombre: 'Alpha' };

    expect([a, b].sort(sortAnimesByName).map((item) => item.nombre)).toEqual(['Alpha', 'Zeta']);
  });

  it('uses id as tie-breaker when names match', () => {
    const a: Anime = { ...baseAnime, id: 'b', nombre: 'Same' };
    const b: Anime = { ...baseAnime, id: 'a', nombre: 'Same' };

    expect([a, b].sort(sortAnimesByName).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('returns zero when both name and id match', () => {
    const a: Anime = { ...baseAnime, id: 'same-id', nombre: 'Same' };
    const b: Anime = { ...baseAnime, id: 'same-id', nombre: 'Same' };

    expect(sortAnimesByName(a, b)).toBe(0);
  });

  it('is case-insensitive', () => {
    const a: Anime = { ...baseAnime, id: 'a', nombre: 'alpha' };
    const b: Anime = { ...baseAnime, id: 'b', nombre: 'BETA' };

    expect([b, a].sort(sortAnimesByName).map((item) => item.nombre)).toEqual(['alpha', 'BETA']);
  });
});
