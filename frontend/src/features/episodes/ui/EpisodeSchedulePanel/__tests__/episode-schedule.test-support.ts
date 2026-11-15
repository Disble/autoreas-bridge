import { vi } from 'vitest';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import type { EpisodeScheduleItem } from '../../../../../shared/contracts/episodes.types';
import { createReadinessGate } from '../../../../../shared/query/readiness-gate/readiness-gate.helpers';
import { createBridgeQueryTestWrapper } from '../../../../../shared/query/test-support/bridge-query.test-support';
import { staticSource, status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import type { EpisodeScheduleSource } from '../episode-schedule-panel.types';

/**
 * Builds a fully stubbed schedule source so each case names only the port it
 * exercises: both reads answer [], the season probe answers daily, and every
 * write answers ok.
 * @param overrides The ports a case spells out.
 * @returns The source.
 */
export function createSource(overrides: Partial<EpisodeScheduleSource> = {}): EpisodeScheduleSource {
  return {
    adjustWatchedEpisodes: vi.fn().mockResolvedValue({ status: 'ok' }),
    copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
    copyAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
    getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
    getEpisodeDayCounts: vi.fn().mockResolvedValue([]),
    getEpisodeSchedule: vi.fn().mockResolvedValue([]),
    getSeasonMode: vi.fn().mockResolvedValue(false),
    openAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
    openAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
    setAnimeState: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  };
}

/**
 * The query wrapper Today's hooks need: a fresh client and a readiness gate
 * whose snapshot holds the episodes module in `episodes` (ready by default).
 * `emit` pushes a later `bridge.readiness` transition.
 * @param episodes The episodes module's readiness in the snapshot.
 * @returns The wrapper, its client, and `emit`.
 */
export function createEpisodesWrapper(episodes: ModuleReadiness = status('episodes', 'ready')) {
  const readiness = staticSource(episodes);
  const { client, wrapper } = createBridgeQueryTestWrapper({ readinessGate: createReadinessGate(readiness.source) });

  return { client, wrapper, emit: readiness.emit };
}

/**
 * One schedule row with stable defaults.
 * @param animeId The row's anime id, also its name.
 * @param overrides The fields a case spells out.
 * @returns The row.
 */
export function scheduleItem(animeId: string, overrides: Partial<EpisodeScheduleItem> = {}): EpisodeScheduleItem {
  return { animeId, animeName: animeId, day: 'Viernes', dayOrder: 1, status: 0, hasCover: false, modified_at: 1000, episodesWatched: 1, ...overrides };
}
