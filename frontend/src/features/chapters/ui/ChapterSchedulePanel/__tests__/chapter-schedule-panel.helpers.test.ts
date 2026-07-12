import { describe, expect, it } from 'vitest';
import { createChapterScheduleSource, dayBadge, getChapterFilterOptions, getDefaultChapterDay, getInitialChapterSelection, toChapterScheduleRows } from '../chapter-schedule-panel.helpers';
import type { ChapterDayCount, ChapterScheduleItem, ChapterScheduleSource, CoverEntry } from '../chapter-schedule-panel.types';

describe('toChapterScheduleRows', () => {
  it('preserves an explicitly injected source for isolated hook tests', () => {
    const source = {} as ChapterScheduleSource;

    expect(createChapterScheduleSource(source)).toBe(source);
  });

  it('maps progress and remaining labels without hiding fractional progress', () => {
    const items: readonly ChapterScheduleItem[] = [
      {
        animeId: 'anime-1',
        animeName: 'Frieren',
        day: 'Viernes',
        dayOrder: 1,
        estado: 0,
        folderPath: '/anime/frieren',
        hasCover: false,
        modified_at: 1000,
        nrocapvisto: 10.5,
        pageUrl: '',
        totalcap: 28,
      },
    ];

    expect(toChapterScheduleRows(items)).toEqual([
      {
        id: 'anime-1',
        name: 'Frieren',
        stateLabel: 'Viendo',
        isProgressBlocked: false,
        watchedLabel: '10.5 watched',
        remainingLabel: '17.5 remaining',
        progressTitle: '10.5 watched of 28 · 17.5 remaining',
        totalLabel: 'of 28',
        modifiedAt: 1000,
        hasPage: false,
        hasFolder: true,
        folderPath: '/anime/frieren',
        pageUrl: '',
        coverDataUrl: undefined,
        showCoverPlaceholder: true,
      },
    ]);
  });

  it('clamps remaining chapters to zero while keeping fractional watched progress', () => {
    const items: readonly ChapterScheduleItem[] = [
      {
        animeId: 'anime-1',
        animeName: 'Frieren',
        day: 'Viernes',
        dayOrder: 1,
        estado: 0,
        hasCover: false,
        modified_at: 1000,
        nrocapvisto: 12.5,
        totalcap: 12,
      },
    ];

    expect(toChapterScheduleRows(items)[0]).toMatchObject({
      watchedLabel: '12.5 watched',
      remainingLabel: '0 remaining',
      progressTitle: '12.5 watched of 12 · 0 remaining',
    });
  });

  it('marks completed, paused, and dropped anime as blocked for direct progress changes', () => {
    const items: readonly ChapterScheduleItem[] = [
      {
        animeId: 'anime-1',
        animeName: 'Paused',
        day: 'Viernes',
        dayOrder: 1,
        estado: 3,
        hasCover: false,
        modified_at: 1000,
        nrocapvisto: 4,
      },
    ];

    expect(toChapterScheduleRows(items)[0]?.isProgressBlocked).toBe(true);
    expect(toChapterScheduleRows(items)[0]?.remainingLabel).toBe('Unknown remaining');
  });

  it('derives hasPage/hasFolder from the literal path strings, defaulting to empty when absent', () => {
    const items: readonly ChapterScheduleItem[] = [
      {
        animeId: 'anime-1',
        animeName: 'No paths',
        day: 'Viernes',
        dayOrder: 1,
        estado: 0,
        hasCover: false,
        modified_at: 1000,
        nrocapvisto: 1,
      },
      {
        animeId: 'anime-2',
        animeName: 'Both paths',
        day: 'Viernes',
        dayOrder: 1,
        estado: 0,
        folderPath: '/anime/both',
        hasCover: false,
        modified_at: 1000,
        nrocapvisto: 1,
        pageUrl: 'https://example.com/both',
      },
    ];

    const rows = toChapterScheduleRows(items);

    expect(rows[0]).toMatchObject({ folderPath: '', hasFolder: false, hasPage: false, pageUrl: '' });
    expect(rows[1]).toMatchObject({ folderPath: '/anime/both', hasFolder: true, hasPage: true, pageUrl: 'https://example.com/both' });
  });

  it('shows the placeholder when hasCover is false, regardless of any cover entry', () => {
    const items: readonly ChapterScheduleItem[] = [
      { animeId: 'anime-1', animeName: 'No cover', day: 'Viernes', dayOrder: 1, estado: 0, hasCover: false, modified_at: 1000, nrocapvisto: 1 },
    ];
    const covers = new Map<string, CoverEntry>([['anime-1', { dataUrl: 'data:image/png;base64,abc', status: 'cover' }]]);

    expect(toChapterScheduleRows(items, covers)[0]).toMatchObject({ coverDataUrl: undefined, showCoverPlaceholder: true });
  });

  it('shows the placeholder while the cover is loading or missing from the map', () => {
    const items: readonly ChapterScheduleItem[] = [
      { animeId: 'anime-1', animeName: 'Loading', day: 'Viernes', dayOrder: 1, estado: 0, hasCover: true, modified_at: 1000, nrocapvisto: 1 },
      { animeId: 'anime-2', animeName: 'Placeholder', day: 'Viernes', dayOrder: 1, estado: 0, hasCover: true, modified_at: 1000, nrocapvisto: 1 },
    ];
    const covers = new Map<string, CoverEntry>([
      ['anime-1', { status: 'loading' }],
      ['anime-2', { status: 'placeholder' }],
    ]);

    const rows = toChapterScheduleRows(items, covers);

    expect(rows[0]).toMatchObject({ coverDataUrl: undefined, showCoverPlaceholder: true });
    expect(rows[1]).toMatchObject({ coverDataUrl: undefined, showCoverPlaceholder: true });
  });

  it('shows the resolved cover once the entry resolves to a data URL', () => {
    const items: readonly ChapterScheduleItem[] = [
      { animeId: 'anime-1', animeName: 'Resolved', day: 'Viernes', dayOrder: 1, estado: 0, hasCover: true, modified_at: 1000, nrocapvisto: 1 },
    ];
    const covers = new Map<string, CoverEntry>([['anime-1', { dataUrl: 'data:image/png;base64,abc', status: 'cover' }]]);

    expect(toChapterScheduleRows(items, covers)[0]).toMatchObject({ coverDataUrl: 'data:image/png;base64,abc', showCoverPlaceholder: false });
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

describe('dayBadge', () => {
  const counts: readonly ChapterDayCount[] = [
    { count: 2, day: 'Lunes' },
    { count: 0, day: 'Martes' },
  ];

  it('returns the count for a matching day with a positive count', () => {
    expect(dayBadge('Lunes', counts)).toBe(2);
  });

  it('returns undefined for a day with a zero count', () => {
    expect(dayBadge('Martes', counts)).toBeUndefined();
  });

  it('returns undefined for a day absent from the counts list', () => {
    expect(dayBadge('Domingo', counts)).toBeUndefined();
  });
});
