import { describe, expect, it } from 'vitest';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import {
  formatSoloAnimeProgress,
  getSoloAnimeDownloadGapLabel,
  getSoloAnimeDownloadOptions,
  toSoloAnimeDownloadOption,
} from '../solo-anime-download-panel.helpers';

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

describe('solo anime download helpers', () => {
  it('formats progress with unknown total fallback', () => {
    expect(formatSoloAnimeProgress(4)).toBe('4 / ?');
    expect(formatSoloAnimeProgress(4, 12)).toBe('4 / 12');
  });

  it('marks an anime downloadable only when active and complete', () => {
    expect(toSoloAnimeDownloadOption(baseAnime).canDownload).toBe(true);
    expect(toSoloAnimeDownloadOption({ ...baseAnime, active: 0 }).canDownload).toBe(false);
    expect(toSoloAnimeDownloadOption({ ...baseAnime, hasFolder: false }).canDownload).toBe(false);
  });

  it('returns a download gap label for missing prerequisites', () => {
    expect(getSoloAnimeDownloadGapLabel({ ...baseAnime, hasDownloadPage: false })).toBe('Missing page');
    expect(getSoloAnimeDownloadGapLabel({ ...baseAnime, hasFolder: false })).toBe('Missing folder');
    expect(getSoloAnimeDownloadGapLabel({ ...baseAnime, hasDownloadPage: false, hasFolder: false })).toBe('Missing page & folder');
  });

  it('filters and sorts selector options by name', () => {
    const options = getSoloAnimeDownloadOptions([
      { ...baseAnime, id: 'b', name: 'Zeta' },
      { ...baseAnime, id: 'a', name: 'Alpha' },
    ], 'alp');

    expect(options.map((option) => option.name)).toEqual(['Alpha']);
  });

  it('caps the selector list at eight items after sorting', () => {
    const options = getSoloAnimeDownloadOptions(
      Array.from({ length: 10 }, (_, index) => ({
        ...baseAnime,
        id: `anime-${index + 1}`,
        name: `Anime ${String(10 - index).padStart(2, '0')}`,
      })),
      '',
    );

    expect(options).toHaveLength(8);
    expect(options[0]?.name).toBe('Anime 01');
    expect(options[7]?.name).toBe('Anime 08');
  });
});
