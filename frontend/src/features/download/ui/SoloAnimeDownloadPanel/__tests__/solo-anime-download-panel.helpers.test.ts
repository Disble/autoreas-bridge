import { describe, expect, it } from 'vitest';
import type { AnimeDownloadReadiness, DownloadReadinessReason } from '../../../../../shared/contracts/download.types';
import { getDownloadReadinessReasonLabel } from '../../../../../shared/constants/download-readiness';
import {
  getSoloAnimeDownloadOptions,
  toSoloAnimeDownloadOption,
} from '../solo-anime-download-panel.helpers';

const readyAnime: AnimeDownloadReadiness = {
  animeId: 'anime-1',
  name: 'Frieren',
  ready: true,
  reasons: [],
  scheduledToday: false,
};

function blocked(reason: DownloadReadinessReason, name = 'Blocked'): AnimeDownloadReadiness {
  return { ...readyAnime, animeId: name.toLowerCase(), name, ready: false, reasons: [reason] };
}

describe('solo anime download helpers', () => {
  it('maps every backend blocker to precise English copy', () => {
    const reasons: DownloadReadinessReason[] = ['missing_source', 'invalid_source', 'unsupported_source', 'destination_unresolved'];
    expect(reasons.map(getDownloadReadinessReasonLabel)).toEqual([
      'Source page is missing.',
      'Source page is invalid.',
      'This source is not supported for downloads.',
      'Download destination could not be resolved.',
    ]);
  });

  it('keeps ready and blocked rows inspectable', () => {
    expect(toSoloAnimeDownloadOption(readyAnime)).toEqual({ id: 'anime-1', name: 'Frieren', ready: true, reasonLabels: [] });
    expect(toSoloAnimeDownloadOption(blocked('destination_unresolved')).reasonLabels).toEqual([
      'Download destination could not be resolved.',
    ]);
  });

  it('searches the full catalog, including inactive and Movie/OVA entries', () => {
    const options = getSoloAnimeDownloadOptions([
      blocked('unsupported_source', 'Zeta'),
      { ...readyAnime, animeId: 'movie', name: 'Movie', scheduledToday: false },
      { ...readyAnime, animeId: 'inactive', name: 'Inactive', scheduledToday: false },
    ], '');

    expect(options.map((option) => option.name)).toEqual(['Inactive', 'Movie', 'Zeta']);
  });

  it('does not truncate a catalog larger than the old selector limit', () => {
    const options = getSoloAnimeDownloadOptions(
      Array.from({ length: 10 }, (_, index) => ({ ...readyAnime, animeId: `anime-${index}`, name: `Anime ${index}` })),
      '',
    );

    expect(options).toHaveLength(10);
  });
});
