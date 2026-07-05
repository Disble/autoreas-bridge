import { CHAPTER_DAY_OPTIONS, CHAPTER_SEASON_OPTIONS, CHAPTER_STATE_LABELS } from './chapter-schedule-panel.constants';
import type { ChapterScheduleItem, ChapterScheduleRow, InitialChapterSelectionInput } from './chapter-schedule-panel.types';

const spanishWeekdayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

/**
 * Converts backend chapter schedule DTOs into UI rows with explicit labels so the
 * rendering component stays dumb and does not duplicate progress math.
 */
export function toChapterScheduleRows(items: readonly ChapterScheduleItem[]): readonly ChapterScheduleRow[] {
  return items.map((item) => {
    const remaining = item.totalcap === undefined ? undefined : item.totalcap - item.nrocapvisto;
    const watchedLabel = `${formatChapterNumber(item.nrocapvisto)} watched`;
    const totalLabel = item.totalcap === undefined ? 'Unknown total' : `of ${item.totalcap}`;
    const remainingLabel = remaining === undefined ? 'Unknown remaining' : `${formatChapterNumber(Math.max(remaining, 0))} remaining`;

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
      hasPage: item.hasPage,
      hasFolder: item.hasFolder,
    };
  });
}

/**
 * Returns the available Legacy schedule filters for the active mode, keeping the
 * component from knowing whether Bridge is browsing weekdays or season lenses.
 */
export function getChapterFilterOptions(isSeasonMode: boolean): readonly string[] {
  return isSeasonMode ? CHAPTER_SEASON_OPTIONS : CHAPTER_DAY_OPTIONS;
}

/**
 * Resolves the selected schedule filter using Legacy semantics: season mode opens
 * on "Ver hoy", while normal mode opens on the current Spanish weekday.
 */
export function getInitialChapterSelection(input: InitialChapterSelectionInput): string {
  if (input.initialDay !== undefined) {
    return input.initialDay;
  }
  return input.isSeasonMode ? 'Ver hoy' : getDefaultChapterDay(input.today);
}

/**
 * Returns Bridge's Spanish weekday key for the current date because the legacy
 * anime schedule stores days in Spanish.
 */
export function getDefaultChapterDay(date: Date = new Date()): string {
  return spanishWeekdayFormatter.format(date).replace(/^./, (char) => char.toUpperCase());
}

/**
 * Formats chapter progress while preserving fractional half-episode values.
 */
export function formatChapterNumber(value: number): string {
  return String(value);
}
