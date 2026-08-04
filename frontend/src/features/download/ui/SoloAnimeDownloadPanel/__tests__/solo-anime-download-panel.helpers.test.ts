import { describe, expect, it } from 'vitest';
import type { AnimeDownloadReadiness, DownloadReadinessReason } from '../../../../../shared/contracts/download.types';
import {
  countSoloAnimeDownloadReadiness,
  getSoloAnimeDownloadEmptyMessage,
  getSoloAnimeDownloadOptions,
  getSoloAnimeDownloadStatusTag,
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

describe('solo anime download status tag', () => {
  it('gives a ready row no tag at all, because readiness is the absence of a blocker', () => {
    expect(getSoloAnimeDownloadStatusTag(readyAnime)).toBeUndefined();
  });

  it('compresses each blocker to a scannable column tag rather than a full sentence', () => {
    expect(getSoloAnimeDownloadStatusTag(blocked('missing_source'))).toBe('No source');
    expect(getSoloAnimeDownloadStatusTag(blocked('invalid_source'))).toBe('Invalid source');
    expect(getSoloAnimeDownloadStatusTag(blocked('unsupported_source'))).toBe('Unsupported');
    expect(getSoloAnimeDownloadStatusTag(blocked('destination_unresolved'))).toBe('No destination');
  });

  it('counts instead of listing when one anime carries several blockers', () => {
    const multi: AnimeDownloadReadiness = { ...readyAnime, ready: false, reasons: ['missing_source', 'unsupported_source'] };
    expect(getSoloAnimeDownloadStatusTag(multi)).toBe('2 issues');
  });

  it('still marks a blocked row the backend sent without reasons', () => {
    expect(getSoloAnimeDownloadStatusTag({ ...readyAnime, ready: false, reasons: [] })).toBe('Blocked');
  });
});

describe('solo anime download option mapping', () => {
  it('keeps the full sentences for the selection alert while exposing the compact tag', () => {
    expect(toSoloAnimeDownloadOption(readyAnime)).toEqual({
      id: 'anime-1',
      name: 'Frieren',
      ready: true,
      reasonLabels: [],
      statusTag: undefined,
    });
    const option = toSoloAnimeDownloadOption(blocked('destination_unresolved'));
    expect(option.reasonLabels).toEqual(['Download destination could not be resolved.']);
    expect(option.statusTag).toBe('No destination');
  });
});

describe('solo anime download partition', () => {
  const catalog = [
    blocked('unsupported_source', 'Zeta'),
    { ...readyAnime, animeId: 'movie', name: 'Movie' },
    { ...readyAnime, animeId: 'inactive', name: 'Inactive' },
    blocked('missing_source', 'Akira'),
  ];

  it('shows only actionable anime on the ready tab', () => {
    expect(getSoloAnimeDownloadOptions(catalog, '', 'ready').map((option) => option.name)).toEqual(['Inactive', 'Movie']);
  });

  it('shows only blocked anime on the blocked tab, so the tabs never overlap', () => {
    expect(getSoloAnimeDownloadOptions(catalog, '', 'blocked').map((option) => option.name)).toEqual(['Akira', 'Zeta']);
  });

  it('searches the full catalog, including inactive and Movie/OVA entries', () => {
    expect(getSoloAnimeDownloadOptions(catalog, 'i', 'ready').map((option) => option.name)).toEqual(['Inactive', 'Movie']);
  });

  it('does not truncate a catalog larger than the old selector limit', () => {
    const options = getSoloAnimeDownloadOptions(
      Array.from({ length: 40 }, (_, index) => ({ ...readyAnime, animeId: `anime-${index}`, name: `Anime ${index}` })),
      '',
      'ready',
    );
    expect(options).toHaveLength(40);
  });

  it('counts both sides against the active search so the tabs stay truthful', () => {
    expect(countSoloAnimeDownloadReadiness(catalog, '')).toEqual({ ready: 2, blocked: 2 });
    expect(countSoloAnimeDownloadReadiness(catalog, 'zeta')).toEqual({ ready: 0, blocked: 1 });
  });
});

describe('solo anime download empty message', () => {
  it('explains an empty tab that has no search behind it', () => {
    expect(getSoloAnimeDownloadEmptyMessage('ready', '', { ready: 0, blocked: 12 })).toBe('No anime is ready for a download check.');
    expect(getSoloAnimeDownloadEmptyMessage('blocked', '', { ready: 12, blocked: 0 })).toBe('No anime is blocked.');
  });

  it('points at the other tab when the search only matched there', () => {
    expect(getSoloAnimeDownloadEmptyMessage('ready', 'oshi', { ready: 0, blocked: 3 })).toBe('No ready anime match "oshi" — 3 blocked matches.');
    expect(getSoloAnimeDownloadEmptyMessage('blocked', 'oshi', { ready: 1, blocked: 0 })).toBe('No blocked anime match "oshi" — 1 ready match.');
  });

  it('does not promise matches elsewhere when there are none', () => {
    expect(getSoloAnimeDownloadEmptyMessage('ready', 'zzz', { ready: 0, blocked: 0 })).toBe('No anime match "zzz".');
  });
});
