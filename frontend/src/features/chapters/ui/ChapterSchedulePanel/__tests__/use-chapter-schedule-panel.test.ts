import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChapterSchedulePanel } from '../use-chapter-schedule-panel';
import type { ChapterScheduleSource } from '../chapter-schedule-panel.types';

function createSource(overrides: Partial<ChapterScheduleSource> = {}): ChapterScheduleSource {
  return {
    adjustWatchedChapters: vi.fn(),
    copyAnimeFolder: vi.fn(),
    copyAnimePage: vi.fn(),
    getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
    getChapterDayCounts: vi.fn().mockResolvedValue([]),
    getSeasonMode: vi.fn().mockResolvedValue(false),
    getChapterSchedule: vi.fn().mockResolvedValue([]),
    openAnimeFolder: vi.fn(),
    openAnimePage: vi.fn(),
    setAnimeState: vi.fn(),
    ...overrides,
  };
}

describe('useChapterSchedulePanel', () => {
  it('loads the selected day schedule through the injected source', async () => {
    const source = createSource({
      getChapterSchedule: vi.fn().mockResolvedValue([
        {
          animeId: 'anime-1',
          animeName: 'Frieren',
          day: 'Viernes',
          dayOrder: 1,
          estado: 0,
          folderPath: '',
          hasCover: false,
          modified_at: 1000,
          nrocapvisto: 10,
          pageUrl: 'https://example.com',
          totalcap: 28,
        },
      ]),
    });

    const { result } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    expect(source.getChapterSchedule).toHaveBeenCalledWith('Viernes');
    expect(result.current.rows[0]?.name).toBe('Frieren');
  });

  it('starts on Ver hoy when season mode is enabled', async () => {
    const source = createSource({
      getChapterSchedule: vi.fn().mockResolvedValue([]),
      getSeasonMode: vi.fn().mockResolvedValue(true),
    });

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
          folderPath: '',
          hasCover: false,
          modified_at: 1000,
          nrocapvisto: 10,
          pageUrl: 'https://example.com',
          totalcap: 28,
        },
      ])
      .mockResolvedValueOnce([]);
    const adjustWatchedChapters = vi.fn().mockResolvedValue({ status: 'ok' });
    const source = createSource({ adjustWatchedChapters, getChapterSchedule });

    const { result } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      await result.current.adjustWatchedChapters('anime-1', 0.5, 1000);
    });

    expect(adjustWatchedChapters).toHaveBeenCalledWith('anime-1', 0.5, 1000);
    expect(getChapterSchedule).toHaveBeenCalledTimes(2);
  });

  it('delegates desktop page and folder actions', async () => {
    const source = createSource({
      copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
      copyAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
      openAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
      openAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const { result } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));

    await act(async () => {
      await result.current.openAnimePage('anime-1');
      await result.current.copyAnimeFolder('anime-1');
    });

    expect(source.openAnimePage).toHaveBeenCalledWith('anime-1');
    expect(source.copyAnimeFolder).toHaveBeenCalledWith('anime-1');
  });

  describe('cover fetching', () => {
    function scheduleItem(animeId: string, hasCover: boolean) {
      return {
        animeId,
        animeName: animeId,
        day: 'Viernes',
        dayOrder: 1,
        estado: 0,
        folderPath: '',
        hasCover,
        modified_at: 1000,
        nrocapvisto: 1,
        pageUrl: '',
      };
    }

    it('fetches the cover once per distinct animeID with hasCover, and never for hasCover:false rows', async () => {
      const getAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,abc', source: 'cover' });
      const source = createSource({
        getAnimeCover,
        getChapterSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', true), scheduleItem('anime-2', false)]),
      });

      const { result, rerender } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(result.current.rows).toHaveLength(2));
      await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
      expect(getAnimeCover).toHaveBeenCalledWith('anime-1');

      rerender();
      rerender();

      await waitFor(() => expect(result.current.rows[0]?.coverDataUrl).toBe('data:image/png;base64,abc'));
      expect(getAnimeCover).toHaveBeenCalledTimes(1);
      expect(result.current.rows[1]?.showCoverPlaceholder).toBe(true);
    });

    it('resolves a rejected cover fetch to a placeholder entry instead of leaving it loading forever', async () => {
      const getAnimeCover = vi.fn().mockRejectedValue(new Error('boom'));
      const source = createSource({
        getAnimeCover,
        getChapterSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', true)]),
      });

      const { result } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(result.current.rows).toHaveLength(1));
      await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.rows[0]?.showCoverPlaceholder).toBe(true));
    });

    it('resolves a placeholder-source cover response to a placeholder entry', async () => {
      const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
      const source = createSource({
        getAnimeCover,
        getChapterSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', true)]),
      });

      const { result } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(result.current.rows).toHaveLength(1));
      await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
      expect(result.current.rows[0]?.showCoverPlaceholder).toBe(true);
    });
  });

  describe('day counts', () => {
    it('fetches day counts once on mount but not again after a plain day selection change', async () => {
      const getChapterDayCounts = vi.fn().mockResolvedValue([{ count: 2, day: 'Viernes' }]);
      const source = createSource({ getChapterDayCounts });

      const { result } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(getChapterDayCounts).toHaveBeenCalledTimes(1));

      act(() => {
        result.current.selectDay('Sábado');
      });

      await waitFor(() => expect(result.current.selectedDay).toBe('Sábado'));
      expect(getChapterDayCounts).toHaveBeenCalledTimes(1);
    });

    it('re-fetches day counts after a successful setAnimeState call', async () => {
      const getChapterDayCounts = vi.fn().mockResolvedValue([]);
      const setAnimeState = vi.fn().mockResolvedValue({ status: 'ok' });
      const source = createSource({
        getChapterDayCounts,
        getChapterSchedule: vi.fn().mockResolvedValue([]),
        setAnimeState,
      });

      const { result } = renderHook(() => useChapterSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(getChapterDayCounts).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.setAnimeState('anime-1', 1, 1000);
      });

      await waitFor(() => expect(getChapterDayCounts).toHaveBeenCalledTimes(2));
    });
  });
});
