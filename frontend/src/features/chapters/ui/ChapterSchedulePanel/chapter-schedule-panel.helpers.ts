import {
  CHAPTER_DAY_OPTIONS,
  CHAPTER_RUNTIME_UNAVAILABLE_RESULT,
  CHAPTER_SCHEDULE_EMPTY_COVERS,
  CHAPTER_SCHEDULE_WEEKDAY_FORMATTER,
  CHAPTER_SEASON_OPTIONS,
  CHAPTER_STATE_LABELS,
} from './chapter-schedule-panel.constants';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import type { AnimeCover, ChapterDayCount, ChapterScheduleItem, ChapterScheduleRow, ChapterScheduleSource, ChapterViewLens, CoverEntry, InitialChapterSelectionInput } from './chapter-schedule-panel.types';

/**
 * Returns an injected schedule source when supplied, otherwise assembles the
 * runtime-backed source with browser-safe fallbacks outside the React hook.
 */
export function createChapterScheduleSource(source?: ChapterScheduleSource): ChapterScheduleSource {
  if (source !== undefined) {
    return source;
  }

  const getAnimeCover = bridgeRuntimeSource.getAnimeCover;

  return {
    adjustWatchedChapters: bridgeRuntimeSource.adjustWatchedChapters ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
    copyAnimeFolder: bridgeRuntimeSource.copyAnimeFolder ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
    copyAnimePage: bridgeRuntimeSource.copyAnimePage ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
    getAnimeCover: getAnimeCover ? (animeID: string) => getAnimeCover(animeID).then(toAnimeCover) : () => Promise.resolve({ source: 'placeholder' }),
    getChapterDayCounts: bridgeRuntimeSource.getChapterDayCounts ?? (() => Promise.resolve([])),
    getChapterSchedule: bridgeRuntimeSource.getChapterSchedule ?? (() => Promise.resolve([])),
    getSeasonMode: preferencesSource.getSeasonMode,
    openAnimeFolder: bridgeRuntimeSource.openAnimeFolder ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
    openAnimePage: bridgeRuntimeSource.openAnimePage ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
    setAnimeState: bridgeRuntimeSource.setAnimeState ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
  };
}

/**
 * Converts backend chapter schedule DTOs into UI rows with explicit labels so the
 * rendering component stays dumb and does not duplicate progress math. `covers`
 * carries the hook's per-session cover cache, keyed by anime id.
 */
export function toChapterScheduleRows(
  items: readonly ChapterScheduleItem[],
  covers: ReadonlyMap<string, CoverEntry> = CHAPTER_SCHEDULE_EMPTY_COVERS,
): readonly ChapterScheduleRow[] {
  return items.map((item) => {
    const remaining = item.totalcap === undefined ? undefined : item.totalcap - item.nrocapvisto;
    const watchedLabel = `${formatChapterNumber(item.nrocapvisto)} watched`;
    const totalLabel = item.totalcap === undefined ? 'Unknown total' : `of ${item.totalcap}`;
    const remainingLabel = remaining === undefined ? 'Unknown remaining' : `${formatChapterNumber(Math.max(remaining, 0))} remaining`;
    const folderPath = item.folderPath ?? '';
    const pageUrl = item.pageUrl ?? '';
    const cover = covers.get(item.animeId);
    const hasResolvedCover = item.hasCover && cover?.status === 'cover';

    return {
      id: item.animeId,
      name: item.animeName,
      stateLabel: CHAPTER_STATE_LABELS[item.estado] ?? 'Unknown',
      isProgressBlocked: item.estado > 0,
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
export function dayBadge(day: string, counts: readonly ChapterDayCount[]): number | undefined {
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
export function getChapterFilterOptions(isSeasonMode: boolean): readonly string[] {
  return isSeasonMode ? CHAPTER_SEASON_OPTIONS : CHAPTER_DAY_OPTIONS;
}

/** Returns the landing filter for the selected Chapters lens. */
export function getDefaultLensSelection(lens: ChapterViewLens, today: Date = new Date()): string {
  return lens === 'season' ? 'Ver hoy' : getDefaultChapterDay(today);
}

/** Narrows a raw toggle key to a supported Chapters lens. */
export function toChapterViewLens(value: string): ChapterViewLens {
  return value === 'season' ? 'season' : 'daily';
}

/**
 * Resolves the selected schedule filter using Legacy semantics: season mode opens
 * on "Ver hoy", while normal mode opens on the current Spanish weekday.
 */
export function getInitialChapterSelection(input: InitialChapterSelectionInput): string {
  if (input.initialDay !== undefined) {
    return input.initialDay;
  }
  return getDefaultLensSelection(input.isSeasonMode ? 'season' : 'daily', input.today);
}

/**
 * Returns Bridge's Spanish weekday key for the current date because the legacy
 * anime schedule stores days in Spanish.
 */
export function getDefaultChapterDay(date: Date = new Date()): string {
  return CHAPTER_SCHEDULE_WEEKDAY_FORMATTER.format(date).replace(/^./, (char) => char.toUpperCase());
}

/**
 * Formats chapter progress while preserving fractional half-episode values.
 */
function formatChapterNumber(value: number): string {
  return String(value);
}
