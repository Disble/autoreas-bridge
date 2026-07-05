import { describe, expect, it } from 'vitest';
import { getChapterFilterOptions, getDefaultChapterDay, getInitialChapterSelection, toChapterScheduleRows } from '../chapter-schedule-panel.helpers';
import type { ChapterScheduleItem } from '../chapter-schedule-panel.types';

describe('toChapterScheduleRows', () => {
  it('maps progress and remaining labels without hiding fractional progress', () => {
    const items: readonly ChapterScheduleItem[] = [
      {
        animeId: 'anime-1',
        animeName: 'Frieren',
        day: 'Viernes',
        dayOrder: 1,
        estado: 0,
        hasFolder: true,
        hasPage: false,
        modified_at: 1000,
        nrocapvisto: 10.5,
        totalcap: 28,
      },
    ];

    expect(toChapterScheduleRows(items)).toEqual([
      {
        id: 'anime-1',
        name: 'Frieren',
        stateLabel: 'Watching',
        isProgressBlocked: false,
        watchedLabel: '10.5 watched',
        remainingLabel: '17.5 remaining',
        progressTitle: '10.5 watched of 28 · 17.5 remaining',
        totalLabel: 'of 28',
        modifiedAt: 1000,
        hasPage: false,
        hasFolder: true,
      },
    ]);
  });

  it('marks completed, paused, and dropped anime as blocked for direct progress changes', () => {
    const items: readonly ChapterScheduleItem[] = [
      {
        animeId: 'anime-1',
        animeName: 'Paused',
        day: 'Viernes',
        dayOrder: 1,
        estado: 3,
        hasFolder: false,
        hasPage: false,
        modified_at: 1000,
        nrocapvisto: 4,
      },
    ];

    expect(toChapterScheduleRows(items)[0]?.isProgressBlocked).toBe(true);
    expect(toChapterScheduleRows(items)[0]?.remainingLabel).toBe('Unknown remaining');
  });
});

describe('getDefaultChapterDay', () => {
  it('returns the current Spanish weekday name', () => {
    expect(getDefaultChapterDay(new Date('2026-07-03T12:00:00'))).toBe('Viernes');
  });
});

describe('chapter filter selection', () => {
  it('uses season lenses and starts on Ver hoy when season mode is active', () => {
    expect(getChapterFilterOptions(true)).toEqual(['Sin ver', 'Visto', 'Ver hoy']);
    expect(getInitialChapterSelection({ isSeasonMode: true, today: new Date('2026-07-04T12:00:00') })).toBe('Ver hoy');
  });

  it('uses weekday lenses and starts on today when season mode is inactive', () => {
    expect(getChapterFilterOptions(false)).toContain('Sábado');
    expect(getInitialChapterSelection({ isSeasonMode: false, today: new Date('2026-07-04T12:00:00') })).toBe('Sábado');
  });
});
