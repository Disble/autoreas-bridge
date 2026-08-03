import {
  EPISODE_DAY_LABELS_EN,
  EPISODE_DAY_OPTIONS,
  EPISODE_RUNTIME_UNAVAILABLE_RESULT,
  EPISODE_SCHEDULE_EMPTY_COVERS,
  EPISODE_SCHEDULE_WEEKDAY_FORMATTER,
  EPISODE_SEASON_OPTIONS,
  EPISODE_STATE_LABELS,
} from './episode-schedule-panel.constants';
import { animeRuntimeSource } from '../../../../infrastructure/anime-runtime-source/anime-runtime-source.helpers';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import type { AnimeCover, EpisodeDayCount, EpisodeScheduleItem, EpisodeScheduleRow, EpisodeScheduleSource, EpisodeViewLens, CoverEntry, InitialEpisodeSelectionInput } from './episode-schedule-panel.types';

/**
 * Returns an injected schedule source when supplied, otherwise assembles the
 * runtime-backed source with browser-safe fallbacks outside the React hook.
 */
export function createEpisodeScheduleSource(source?: EpisodeScheduleSource): EpisodeScheduleSource {
  if (source !== undefined) {
    return source;
  }

  const getAnimeCover = bridgeRuntimeSource.getAnimeCover;

  return {
    adjustWatchedEpisodes: bridgeRuntimeSource.adjustWatchedEpisodes ?? (() => Promise.resolve(EPISODE_RUNTIME_UNAVAILABLE_RESULT)),
    copyAnimeFolder: bridgeRuntimeSource.copyAnimeFolder ?? (() => Promise.resolve(EPISODE_RUNTIME_UNAVAILABLE_RESULT)),
    copyAnimePage: bridgeRuntimeSource.copyAnimePage ?? (() => Promise.resolve(EPISODE_RUNTIME_UNAVAILABLE_RESULT)),
    getAnimeCover: getAnimeCover ? (animeID: string) => getAnimeCover(animeID).then(toAnimeCover) : () => Promise.resolve({ source: 'placeholder' }),
    getEpisodeDayCounts: bridgeRuntimeSource.getEpisodeDayCounts ?? (() => Promise.resolve([])),
    getEpisodeSchedule: bridgeRuntimeSource.getEpisodeSchedule ?? (() => Promise.resolve([])),
    getSeasonMode: preferencesSource.getSeasonMode,
    openAnimeFolder: bridgeRuntimeSource.openAnimeFolder ?? (() => Promise.resolve(EPISODE_RUNTIME_UNAVAILABLE_RESULT)),
    openAnimePage: bridgeRuntimeSource.openAnimePage ?? (() => Promise.resolve(EPISODE_RUNTIME_UNAVAILABLE_RESULT)),
    setAnimeState: bridgeRuntimeSource.setAnimeState ?? (() => Promise.resolve(EPISODE_RUNTIME_UNAVAILABLE_RESULT)),
    subscribeAnimeChanges: (listener) => animeRuntimeSource.subscribeAnimeChanges(() => listener()),
  };
}

/**
 * Converts backend episode schedule DTOs into UI rows with explicit labels so the
 * rendering component stays dumb and does not duplicate progress math. `covers`
 * carries the hook's per-session cover cache, keyed by anime id.
 */
export function toEpisodeScheduleRows(
  items: readonly EpisodeScheduleItem[],
  covers: ReadonlyMap<string, CoverEntry> = EPISODE_SCHEDULE_EMPTY_COVERS,
): readonly EpisodeScheduleRow[] {
  return items.map((item) => {
    const remaining = item.totalEpisodes === undefined ? undefined : item.totalEpisodes - item.episodesWatched;
    const watchedLabel = `${formatEpisodeNumber(item.episodesWatched)} watched`;
    const totalLabel = item.totalEpisodes === undefined ? 'Unknown total' : `of ${item.totalEpisodes}`;
    const remainingLabel = remaining === undefined ? 'Unknown remaining' : `${formatEpisodeNumber(Math.max(remaining, 0))} remaining`;
    const folderPath = item.folderPath ?? '';
    const pageUrl = item.pageUrl ?? '';
    const cover = covers.get(item.animeId);
    const hasResolvedCover = item.hasCover && cover?.status === 'cover';

    return {
      id: item.animeId,
      name: item.animeName,
      stateLabel: EPISODE_STATE_LABELS[item.status] ?? 'Unknown',
      isProgressBlocked: item.status > 0,
      watchedLabel,
      remainingLabel,
      progressTitle: `${watchedLabel} ${totalLabel} · ${remainingLabel}`,
      totalLabel,
      modifiedAt: item.modified_at,
      hasPage: pageUrl !== '',
      hasFolder: folderPath !== '',
      folderPath,
      pageUrl,
      coverDataUrl: hasResolvedCover ? cover.dataUrl : undefined,
      showCoverPlaceholder: !hasResolvedCover,
    };
  });
}

/**
 * Returns the badge count for a weekday, or undefined when the day is absent
 * or has a zero count (spec: a count of 0 SHALL show no badge at all).
 */
export function dayBadge(day: string, counts: readonly EpisodeDayCount[]): number | undefined {
  const count = counts.find((entry) => entry.day === day)?.count;
  return count === undefined || count === 0 ? undefined : count;
}

/**
 * Normalizes a wire-shaped cover response (an open `source: string`, as
 * generated from the Go contract) into the feature's narrower `AnimeCover`
 * union, treating any non-'cover' source or a missing data URL as a placeholder.
 */
function toAnimeCover(raw: { readonly dataUrl?: string; readonly source: string }): AnimeCover {
  return raw.source === 'cover' && raw.dataUrl !== undefined ? { dataUrl: raw.dataUrl, source: 'cover' } : { source: 'placeholder' };
}

/**
 * Returns the available Legacy schedule filters for the active mode, keeping the
 * component from knowing whether Bridge is browsing weekdays or season lenses.
 */
export function getEpisodeFilterOptions(isSeasonMode: boolean): readonly string[] {
  return isSeasonMode ? EPISODE_SEASON_OPTIONS : EPISODE_DAY_OPTIONS;
}

/** Returns the landing filter for the selected Episodes lens. */
export function getDefaultLensSelection(lens: EpisodeViewLens, today: Date = new Date()): string {
  return lens === 'season' ? 'Ver hoy' : getDefaultEpisodeDay(today);
}

/** Narrows a raw toggle key to a supported Episodes lens. */
export function toEpisodeViewLens(value: string): EpisodeViewLens {
  return value === 'season' ? 'season' : 'daily';
}

/**
 * Resolves the selected schedule filter using Legacy semantics: season mode opens
 * on "Ver hoy", while normal mode opens on the current Spanish weekday.
 */
export function getInitialEpisodeSelection(input: InitialEpisodeSelectionInput): string {
  if (input.initialDay !== undefined) {
    return input.initialDay;
  }
  return getDefaultLensSelection(input.isSeasonMode ? 'season' : 'daily', input.today);
}

/**
 * Returns Bridge's Spanish weekday key for the current date because the legacy
 * anime schedule stores days in Spanish.
 */
export function getDefaultEpisodeDay(date: Date = new Date()): string {
  return EPISODE_SCHEDULE_WEEKDAY_FORMATTER.format(date).replace(/^./, (char) => char.toUpperCase());
}

/**
 * Renders the English weekday label for a Spanish weekday key. Non-weekday
 * keys (e.g. the ADR-007 season status literals "Ver hoy"/"Visto") pass
 * through unchanged since they are not translated by this map.
 */
export function episodeDayLabel(dayKey: string): string {
  return EPISODE_DAY_LABELS_EN[dayKey] ?? dayKey;
}

/**
 * Formats episode progress while preserving fractional half-episode values.
 */
function formatEpisodeNumber(value: number): string {
  return String(value);
}
