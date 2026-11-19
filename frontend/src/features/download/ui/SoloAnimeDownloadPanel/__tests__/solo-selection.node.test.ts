import { describe, expect, it } from 'vitest';
import type { AnimeDownloadReadiness } from '../../../../../shared/contracts/download.types';
import { SOLO_ANIME_DOWNLOAD_IN_PROGRESS_MESSAGE } from '../solo-anime-download-panel.constants';
import {
  canTriggerSoloDownload,
  findSoloAnimeDownloadSelection,
  soloReadinessItems,
  toSoloAnimeDownloadFilter,
  toSoloTriggerFailureState,
} from '../solo-anime-download-panel.helpers';

/** Builds a readiness row with only the fields the selection reads. */
function readiness(animeId: string, ready: boolean): AnimeDownloadReadiness {
  return { animeId, name: `Anime ${animeId}`, ready, reasons: [], scheduledToday: false };
}

describe('findSoloAnimeDownloadSelection', () => {
  const items = [readiness('a', true), readiness('b', false)];

  it('resolves the picked anime against the whole catalog', () => {
    expect(findSoloAnimeDownloadSelection(items, 'b')).toMatchObject({ ready: false });
  });

  it('returns undefined for an unknown id or no selection', () => {
    const cases = [['an unknown id', 'zz'], ['no selection', undefined]] as const;

    for (const [_, id] of cases) {
      const caseName = `returns undefined for ${String(_)}`;
      expect.soft(findSoloAnimeDownloadSelection(items, id), caseName).toBeUndefined();
    }
  });
});

describe('toSoloAnimeDownloadFilter', () => {
  it('maps the filter key to blocked or ready', () => {
    const cases = [['blocked', 'blocked'], ['ready', 'ready'], ['anything else', 'ready']] as const;

    for (const [value, filter] of cases) {
      const caseName = `maps ${String(value)} to ${String(filter)}`;
      expect.soft(toSoloAnimeDownloadFilter(value), caseName).toBe(filter);
    }
  });
});

describe('toSoloTriggerFailureState', () => {
  const previous = { query: 'q', filter: 'ready', selectedAnimeID: 'a', status: 'triggering', errorMessage: undefined } as const;

  it('reports an already running download without an error message', () => {
    expect(toSoloTriggerFailureState(previous, new Error(SOLO_ANIME_DOWNLOAD_IN_PROGRESS_MESSAGE))).toEqual({ ...previous, status: 'already-in-progress' });
  });

  it('reports any other failure with its message and keeps the rest of the state', () => {
    expect(toSoloTriggerFailureState(previous, new Error('JDownloader is offline'))).toEqual({ ...previous, status: 'trigger-error', errorMessage: 'JDownloader is offline' });
  });
});

describe('canTriggerSoloDownload', () => {
  const option = (ready: boolean) => findSoloAnimeDownloadSelection([readiness('a', ready)], 'a');

  it('allows a download only for a ready pick on a ready panel', () => {
    const cases = [
      ['a ready pick', option(true), 'ready', true],
      ['a blocked pick', option(false), 'ready', false],
      ['no pick', undefined, 'ready', false],
      ['a running trigger', option(true), 'triggering', false],
    ] as const;

    for (const [_, selected, status, expected] of cases) {
      const caseName = `allows ${String(_)}: ${String(selected)}`;
      expect.soft(canTriggerSoloDownload(selected, status), caseName).toBe(expected);
    }
  });
});

describe('soloReadinessItems', () => {
  const items = [readiness('a', true)];

  it('lists the catalog once the read is ready', () => {
    expect(soloReadinessItems({ kind: 'ready', data: { items }, isRefreshing: false })).toBe(items);
  });

  it('shows no anime while loading, failed or empty', () => {
    const cases = ['loading', 'failure', 'empty'] as const;

    for (const kind of cases) {
      const caseName = `shows no anime while ${String(kind)}`;
      expect.soft(soloReadinessItems({ kind } as Parameters<typeof soloReadinessItems>[0]), caseName).toEqual([]);
    }
  });
});
