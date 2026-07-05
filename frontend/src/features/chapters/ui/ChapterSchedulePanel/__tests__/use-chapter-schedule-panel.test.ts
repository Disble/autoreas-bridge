import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChapterSchedulePanel } from '../use-chapter-schedule-panel';
import type { ChapterScheduleSource } from '../chapter-schedule-panel.types';

describe('useChapterSchedulePanel', () => {
  it('loads the selected day schedule through the injected source', async () => {
    const source: ChapterScheduleSource = {
      adjustWatchedChapters: vi.fn(),
      copyAnimeFolder: vi.fn(),
      copyAnimePage: vi.fn(),
      getSeasonMode: vi.fn().mockResolvedValue(false),
      getChapterSchedule: vi.fn().mockResolvedValue([
        {
          animeId: 'anime-1',
          animeName: 'Frieren',
          day: 'Viernes',
          dayOrder: 1,
          estado: 0,
          hasFolder: false,
          hasPage: true,
          modified_at: 1000,
          nrocapvisto: 10,
          totalcap: 28,
        },
      ]),
      openAnimeFolder: vi.fn(),
      openAnimePage: vi.fn(),
      setAnimeState: vi.fn(),
    };

    const { result } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    expect(source.getChapterSchedule).toHaveBeenCalledWith('Viernes');
    expect(result.current.rows[0]?.name).toBe('Frieren');
  });

  it('starts on Ver hoy when season mode is enabled', async () => {
    const source: ChapterScheduleSource = {
      adjustWatchedChapters: vi.fn(),
      copyAnimeFolder: vi.fn(),
      copyAnimePage: vi.fn(),
      getChapterSchedule: vi.fn().mockResolvedValue([]),
      getSeasonMode: vi.fn().mockResolvedValue(true),
      openAnimeFolder: vi.fn(),
      openAnimePage: vi.fn(),
      setAnimeState: vi.fn(),
    };

    const { result } = renderHook(() => useChapterSchedulePanel({ source }));

    await waitFor(() => expect(result.current.selectedDay).toBe('Ver hoy'));
    await waitFor(() => expect(source.getChapterSchedule).toHaveBeenLastCalledWith('Ver hoy'));
    expect(result.current.filterOptions).toEqual(['Sin ver', 'Visto', 'Ver hoy']);
  });

  it('delegates chapter adjustments with the row modified_at base and refreshes', async () => {
    const getChapterSchedule = vi
      .fn()
      .mockResolvedValueOnce([
        {
          animeId: 'anime-1',
          animeName: 'Frieren',
          day: 'Viernes',
          dayOrder: 1,
          estado: 0,
          hasFolder: false,
          hasPage: true,
          modified_at: 1000,
          nrocapvisto: 10,
          totalcap: 28,
        },
      ])
      .mockResolvedValueOnce([]);
    const adjustWatchedChapters = vi.fn().mockResolvedValue({ status: 'ok' });
    const source: ChapterScheduleSource = {
      adjustWatchedChapters,
      copyAnimeFolder: vi.fn(),
      copyAnimePage: vi.fn(),
      getChapterSchedule,
      getSeasonMode: vi.fn().mockResolvedValue(false),
      openAnimeFolder: vi.fn(),
      openAnimePage: vi.fn(),
      setAnimeState: vi.fn(),
    };

    const { result } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      await result.current.adjustWatchedChapters('anime-1', 0.5, 1000);
    });

    expect(adjustWatchedChapters).toHaveBeenCalledWith('anime-1', 0.5, 1000);
    expect(getChapterSchedule).toHaveBeenCalledTimes(2);
  });

  it('delegates desktop page and folder actions', async () => {
    const source: ChapterScheduleSource = {
      adjustWatchedChapters: vi.fn(),
      copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
      copyAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
      getChapterSchedule: vi.fn().mockResolvedValue([]),
      getSeasonMode: vi.fn().mockResolvedValue(false),
      openAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
      openAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
      setAnimeState: vi.fn(),
    };

    const { result } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));

    await act(async () => {
      await result.current.openAnimePage('anime-1');
      await result.current.copyAnimeFolder('anime-1');
    });

    expect(source.openAnimePage).toHaveBeenCalledWith('anime-1');
    expect(source.copyAnimeFolder).toHaveBeenCalledWith('anime-1');
  });
});
