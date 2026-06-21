import { describe, expect, it } from 'vitest';
import type { SyncingAnime } from '../../../../../shared/contracts/syncing-anime.types';
import {
  formatSyncingAnimeProgress,
  formatSyncingAnimeQueueLabel,
  toSyncingAnimePanelViewModel,
} from '../syncing-anime-panel.helpers';

describe('formatSyncingAnimeQueueLabel', () => {
  it('formats a singular pending-change label', () => {
    expect(formatSyncingAnimeQueueLabel(1)).toBe('1 pending change');
  });

  it('formats a plural pending-change label', () => {
    expect(formatSyncingAnimeQueueLabel(3)).toBe('3 pending changes');
  });
});

describe('formatSyncingAnimeProgress', () => {
  it('formats current and total progress when both exist', () => {
    expect(formatSyncingAnimeProgress(18, 24)).toBe('Episode 18 / 24');
  });

  it('formats a current-only progress label when total is missing', () => {
    expect(formatSyncingAnimeProgress(10.5)).toBe('Episode 10.5');
  });

  it('returns null when no truthful progress exists', () => {
    expect(formatSyncingAnimeProgress()).toBeNull();
  });
});

describe('toSyncingAnimePanelViewModel', () => {
  it('maps runtime items into a render-ready view model', () => {
    const item: SyncingAnime = {
      animeId: 'anime-7',
      title: 'Dungeon Meshi',
      changeType: 'update',
      pendingChanges: 2,
      changedFields: ['nrocapvisto', 'estado'],
      progressCurrent: 18,
      progressTotal: 24,
      lastChangedAtMs: Date.UTC(2026, 5, 20, 18, 15, 0),
      activo: 1,
    };

    expect(toSyncingAnimePanelViewModel(item)).toMatchObject({
      animeId: 'anime-7',
      title: 'Dungeon Meshi',
      changeLabel: 'Updated',
      queueLabel: '2 pending changes',
      progressLabel: 'Episode 18 / 24',
      changedFields: ['nrocapvisto', 'estado'],
    });
  });

  it('normalizes null changedFields to an empty array', () => {
    const item = {
      animeId: 'anime-9',
      title: 'Frieren',
      changeType: 'delete',
      pendingChanges: 1,
      changedFields: null as unknown as string[],
      lastChangedAtMs: Date.UTC(2026, 5, 20, 19, 0, 0),
      activo: 0,
    };

    expect(toSyncingAnimePanelViewModel(item as SyncingAnime).changedFields).toEqual([]);
  });

  it('falls back to the anime id when title is empty and keeps progress empty when unknown', () => {
    const item: SyncingAnime = {
      animeId: 'anime-9',
      title: '',
      changeType: 'delete',
      pendingChanges: 1,
      changedFields: [],
      lastChangedAtMs: Date.UTC(2026, 5, 20, 19, 0, 0),
      activo: 0,
    };

    expect(toSyncingAnimePanelViewModel(item)).toMatchObject({
      animeId: 'anime-9',
      title: 'anime-9',
      changeLabel: 'Removed',
      queueLabel: '1 pending change',
      progressLabel: null,
      changedFields: [],
    });
  });
});
