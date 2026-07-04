import { CHAPTER_STATE_LABELS } from './chapter-schedule-panel.constants';
import type { ChapterScheduleItem, ChapterScheduleRow } from './chapter-schedule-panel.types';

const spanishWeekdayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

/**
 * Converts backend chapter schedule DTOs into UI rows with explicit labels so the
 * rendering component stays dumb and does not duplicate progress math.
 */
export function toChapterScheduleRows(items: readonly ChapterScheduleItem[]): readonly ChapterScheduleRow[] {
  return items.map((item) => {
    const remaining = item.totalcap === undefined ? undefined : item.totalcap - item.nrocapvisto;

    return {
      id: item.animeId,
      name: item.animeName,
      stateLabel: CHAPTER_STATE_LABELS[item.estado] ?? 'Unknown',
      isProgressBlocked: item.estado > 0,
      watchedLabel: `${formatChapterNumber(item.nrocapvisto)} watched`,
      remainingLabel: remaining === undefined ? 'Unknown remaining' : `${formatChapterNumber(Math.max(remaining, 0))} remaining`,
      totalLabel: item.totalcap === undefined ? 'Unknown total' : `of ${item.totalcap}`,
      modifiedAt: item.modified_at,
      hasPage: item.hasPage,
      hasFolder: item.hasFolder,
    };
  });
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
