import { describe, expect, it } from 'vitest';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import {
  formatAnimeProgress,
  sortAnimesByName,
  toAnimeStatus,
  toAnimeViewModel,
} from '../anime-panel.helpers';

const baseAnime: Anime = {
  id: 'anime-1',
  nombre: 'Frieren',
  estado: 2,
  nrocapvisto: 12,
  totalcap: 28,
  activo: 1,
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
    });
  });

  it('maps an inactive anime to the view model', () => {
    const viewModel = toAnimeViewModel({ ...baseAnime, activo: 0 });

    expect(viewModel.status).toBe('inactive');
    expect(viewModel.statusLabel).toBe('Inactive');
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

  it('is case-insensitive', () => {
    const a: Anime = { ...baseAnime, id: 'a', nombre: 'alpha' };
    const b: Anime = { ...baseAnime, id: 'b', nombre: 'BETA' };

    expect([b, a].sort(sortAnimesByName).map((item) => item.nombre)).toEqual(['alpha', 'BETA']);
  });
});
