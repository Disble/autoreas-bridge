import { describe, expect, it } from 'vitest';
import { getDefaultChapterDay, toChapterScheduleRows } from '../chapter-schedule-panel.helpers';
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
