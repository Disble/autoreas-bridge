import { describe, expect, it } from 'vitest';
import { createEpisodeScheduleSource, dayBadge, episodeDayLabel, getEpisodeFilterOptions, getDefaultEpisodeDay, getDefaultLensSelection, getInitialEpisodeSelection, toEpisodeScheduleRows, toEpisodeViewLens } from '../episode-schedule-panel.helpers';
import type { EpisodeDayCount, EpisodeScheduleItem, EpisodeScheduleSource, CoverEntry } from '../episode-schedule-panel.types';

describe('toEpisodeScheduleRows', () => {
  it('preserves an explicitly injected source for isolated hook tests', () => {
    const source = {} as EpisodeScheduleSource;

    expect(createEpisodeScheduleSource(source)).toBe(source);
  });

  it('maps progress and remaining labels without hiding fractional progress', () => {
    const items: readonly EpisodeScheduleItem[] = [
      {
        animeId: 'anime-1',
        animeName: 'Frieren',
        day: 'Viernes',
        dayOrder: 1,
        status: 0,
        folderPath: '/anime/frieren',
        hasCover: false,
        modified_at: 1000,
        episodesWatched: 10.5,
        pageUrl: '',
        totalEpisodes: 28,
      },
    ];

    expect(toEpisodeScheduleRows(items)).toEqual([
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

  it('clamps remaining episodes to zero while keeping fractional watched progress', () => {
    const items: readonly EpisodeScheduleItem[] = [
      {
        animeId: 'anime-1',
        animeName: 'Frieren',
        day: 'Viernes',
        dayOrder: 1,
        status: 0,
        hasCover: false,
        modified_at: 1000,
        episodesWatched: 12.5,
        totalEpisodes: 12,
      },
    ];

    expect(toEpisodeScheduleRows(items)[0]).toMatchObject({
      watchedLabel: '12.5 watched',
      remainingLabel: '0 remaining',
      progressTitle: '12.5 watched of 12 · 0 remaining',
    });
  });

  it('marks completed, paused, and dropped anime as blocked for direct progress changes', () => {
    const items: readonly EpisodeScheduleItem[] = [
      {
        animeId: 'anime-1',
        animeName: 'Paused',
        day: 'Viernes',
        dayOrder: 1,
        status: 3,
        hasCover: false,
        modified_at: 1000,
        episodesWatched: 4,
      },
    ];

    expect(toEpisodeScheduleRows(items)[0]?.isProgressBlocked).toBe(true);
    expect(toEpisodeScheduleRows(items)[0]?.remainingLabel).toBe('Unknown remaining');
  });

  it('derives hasPage/hasFolder from the literal path strings, defaulting to empty when absent', () => {
    const items: readonly EpisodeScheduleItem[] = [
      {
        animeId: 'anime-1',
        animeName: 'No paths',
        day: 'Viernes',
        dayOrder: 1,
        status: 0,
        hasCover: false,
        modified_at: 1000,
        episodesWatched: 1,
      },
      {
        animeId: 'anime-2',
        animeName: 'Both paths',
        day: 'Viernes',
        dayOrder: 1,
        status: 0,
        folderPath: '/anime/both',
        hasCover: false,
        modified_at: 1000,
        episodesWatched: 1,
        pageUrl: 'https://example.com/both',
      },
    ];

    const rows = toEpisodeScheduleRows(items);

    expect(rows[0]).toMatchObject({ folderPath: '', hasFolder: false, hasPage: false, pageUrl: '' });
    expect(rows[1]).toMatchObject({ folderPath: '/anime/both', hasFolder: true, hasPage: true, pageUrl: 'https://example.com/both' });
  });

  it('shows the placeholder when hasCover is false, regardless of any cover entry', () => {
    const items: readonly EpisodeScheduleItem[] = [
      { animeId: 'anime-1', animeName: 'No cover', day: 'Viernes', dayOrder: 1, status: 0, hasCover: false, modified_at: 1000, episodesWatched: 1 },
    ];
    const covers = new Map<string, CoverEntry>([['anime-1', { dataUrl: 'data:image/png;base64,abc', status: 'cover' }]]);

    expect(toEpisodeScheduleRows(items, covers)[0]).toMatchObject({ coverDataUrl: undefined, showCoverPlaceholder: true });
  });

  it('shows the placeholder while the cover is loading or missing from the map', () => {
    const items: readonly EpisodeScheduleItem[] = [
      { animeId: 'anime-1', animeName: 'Loading', day: 'Viernes', dayOrder: 1, status: 0, hasCover: true, modified_at: 1000, episodesWatched: 1 },
      { animeId: 'anime-2', animeName: 'Placeholder', day: 'Viernes', dayOrder: 1, status: 0, hasCover: true, modified_at: 1000, episodesWatched: 1 },
    ];
    const covers = new Map<string, CoverEntry>([
      ['anime-1', { status: 'loading' }],
      ['anime-2', { status: 'placeholder' }],
    ]);

    const rows = toEpisodeScheduleRows(items, covers);

    expect(rows[0]).toMatchObject({ coverDataUrl: undefined, showCoverPlaceholder: true });
    expect(rows[1]).toMatchObject({ coverDataUrl: undefined, showCoverPlaceholder: true });
  });

  it('shows the resolved cover once the entry resolves to a data URL', () => {
    const items: readonly EpisodeScheduleItem[] = [
      { animeId: 'anime-1', animeName: 'Resolved', day: 'Viernes', dayOrder: 1, status: 0, hasCover: true, modified_at: 1000, episodesWatched: 1 },
    ];
    const covers = new Map<string, CoverEntry>([['anime-1', { dataUrl: 'data:image/png;base64,abc', status: 'cover' }]]);

    expect(toEpisodeScheduleRows(items, covers)[0]).toMatchObject({ coverDataUrl: 'data:image/png;base64,abc', showCoverPlaceholder: false });
  });
});

describe('getDefaultEpisodeDay', () => {
  it('returns the current Spanish weekday name', () => {
    expect(getDefaultEpisodeDay(new Date('2026-07-03T12:00:00'))).toBe('Viernes');
  });
});

describe('episode filter selection', () => {
  it('uses season lenses and starts on Ver hoy when season mode is active', () => {
    expect(getEpisodeFilterOptions(true)).toEqual(['Sin ver', 'Visto', 'Ver hoy']);
    expect(getInitialEpisodeSelection({ isSeasonMode: true, today: new Date('2026-07-04T12:00:00') })).toBe('Ver hoy');
  });

  it('uses weekday lenses and starts on today when season mode is inactive', () => {
    expect(getEpisodeFilterOptions(false)).toContain('Sábado');
    expect(getInitialEpisodeSelection({ isSeasonMode: false, today: new Date('2026-07-04T12:00:00') })).toBe('Sábado');
  });
});

describe('getDefaultLensSelection', () => {
  it('opens the season lens on Ver hoy', () => {
    expect(getDefaultLensSelection('season', new Date('2026-07-04T12:00:00'))).toBe('Ver hoy');
  });

  it('opens the daily lens on the current weekday', () => {
    expect(getDefaultLensSelection('daily', new Date('2026-07-04T12:00:00'))).toBe('Sábado');
  });
});

describe('toEpisodeViewLens', () => {
  it('keeps supported keys and defaults unknown values to daily', () => {
    expect(toEpisodeViewLens('season')).toBe('season');
    expect(toEpisodeViewLens('daily')).toBe('daily');
    expect(toEpisodeViewLens('garbage')).toBe('daily');
  });
});

describe('dayBadge', () => {
  const counts: readonly EpisodeDayCount[] = [
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

describe('episodeDayLabel', () => {
  it('returns the English weekday name for each Spanish weekday key', () => {
    expect(episodeDayLabel('Lunes')).toBe('Monday');
    expect(episodeDayLabel('Martes')).toBe('Tuesday');
    expect(episodeDayLabel('Miércoles')).toBe('Wednesday');
    expect(episodeDayLabel('Jueves')).toBe('Thursday');
    expect(episodeDayLabel('Viernes')).toBe('Friday');
    expect(episodeDayLabel('Sábado')).toBe('Saturday');
    expect(episodeDayLabel('Domingo')).toBe('Sunday');
  });

  it('leaves ADR-007 season status literals unchanged (not weekday keys)', () => {
    expect(episodeDayLabel('Ver hoy')).toBe('Ver hoy');
    expect(episodeDayLabel('Visto')).toBe('Visto');
    expect(episodeDayLabel('Sin ver')).toBe('Sin ver');
  });
});
