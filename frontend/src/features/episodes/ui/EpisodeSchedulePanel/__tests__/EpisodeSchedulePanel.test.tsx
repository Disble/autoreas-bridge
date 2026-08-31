import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpisodeSchedulePanel } from '../EpisodeSchedulePanel';
import type { EpisodeScheduleSource } from '../episode-schedule-panel.types';

/**
 * Builds a fully stubbed episode schedule source so each test only spells out
 * the one port it exercises.
 */
function createSource(overrides: Partial<EpisodeScheduleSource> = {}): EpisodeScheduleSource {
  return {
    adjustWatchedEpisodes: vi.fn().mockResolvedValue({ status: 'ok' }),
    copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
    copyAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
    getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
    getEpisodeDayCounts: vi.fn().mockResolvedValue([]),
    subscribeAnimeChanges: vi.fn().mockReturnValue(() => undefined),
    getEpisodeSchedule: vi.fn().mockResolvedValue([]),
    getSeasonMode: vi.fn().mockResolvedValue(false),
    openAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
    openAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
    setAnimeState: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * Pins the system clock so the current-day tab marker is deterministic; without
 * it the marker lands on whatever weekday the suite happens to run on.
 */
function pinToday(date: Date): void {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(date);
}

describe('EpisodeSchedulePanel', () => {
  it('keeps episode adjustments to one plus and one minus action with secondary-click half steps', async () => {
    const adjustWatchedEpisodes = vi.fn().mockResolvedValue({ status: 'ok' });
    const source = createSource({
      adjustWatchedEpisodes,
      getEpisodeSchedule: vi.fn().mockResolvedValue([
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
          pageUrl: 'https://example.com/frieren',
          totalEpisodes: 28,
        },
      ]),
    });

    render(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

    expect(await screen.findByText('Frieren')).toBeInTheDocument();
    expect(screen.getByText('10.5 watched')).toHaveClass('group-hover:hidden');
    expect(screen.getByText('17.5 remaining')).toHaveClass('group-hover:inline');
    expect(screen.getByRole('button', { name: 'Open page for Frieren. Secondary click copies page URL.' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add one episode for Frieren. Secondary click adds half episode.' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Add one episode for Frieren. Secondary click adds half episode.' }));

    await waitFor(() => expect(adjustWatchedEpisodes).toHaveBeenCalledWith('anime-1', 1, 1000));
    expect(adjustWatchedEpisodes).toHaveBeenCalledWith('anime-1', 0.5, 1000);
  });

  it('uses one status button that opens the state modal', async () => {
    const setAnimeState = vi.fn().mockResolvedValue({ status: 'ok' });
    const source = createSource({
      getEpisodeSchedule: vi.fn().mockResolvedValue([
        {
          animeId: 'anime-1',
          animeName: 'Frieren',
          day: 'Viernes',
          dayOrder: 1,
          status: 0,
          hasCover: false,
          modified_at: 1000,
          episodesWatched: 10,
          totalEpisodes: 28,
        },
      ]),
      setAnimeState,
    });

    render(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Change status for Frieren. Current status: Viendo.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Frieren as Finalizado' }));

    await waitFor(() => expect(setAnimeState).toHaveBeenCalledWith('anime-1', 1, 1000));
  });

  it('delegates page and folder right-click copy actions', async () => {
    const copyAnimePage = vi.fn().mockResolvedValue({ status: 'ok' });
    const copyAnimeFolder = vi.fn().mockResolvedValue({ status: 'ok' });
    const source = createSource({
      copyAnimeFolder,
      copyAnimePage,
      getEpisodeSchedule: vi.fn().mockResolvedValue([
        {
          animeId: 'anime-1',
          animeName: 'Frieren',
          day: 'Viernes',
          dayOrder: 1,
          status: 0,
          folderPath: '/anime/frieren',
          hasCover: false,
          modified_at: 1000,
          episodesWatched: 10,
          pageUrl: 'https://example.com/frieren',
          totalEpisodes: 28,
        },
      ]),
    });

    render(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Open page for Frieren. Secondary click copies page URL.' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Open folder for Frieren. Secondary click copies folder path.' }));

    await waitFor(() => expect(copyAnimePage).toHaveBeenCalledWith('anime-1'));
    expect(copyAnimeFolder).toHaveBeenCalledWith('anime-1');
  });

  it('disables progress buttons for paused/completed/dropped anime', async () => {
    const source = createSource({
      getEpisodeSchedule: vi.fn().mockResolvedValue([
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
      ]),
    });

    render(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

    expect(await screen.findByRole('heading', { name: 'Paused' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add one episode for Paused. Secondary click adds half episode.' })).toBeDisabled();
  });

  describe('view lens toggle', () => {
    it('switches the filter row from season lenses to weekdays when Daily is selected, with season mode on', async () => {
      const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });

      render(<EpisodeSchedulePanel source={source} />);

      expect(await screen.findByRole('radio', { name: /Sin ver/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('radio', { name: 'Daily' }));

      expect(await screen.findByRole('radio', { name: /Monday/ })).toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: /Sin ver/ })).not.toBeInTheDocument();
    });
  });

  describe('day count badges', () => {
    it('shows a count badge on a day ToggleButton with qualifying entries', async () => {
      const source = createSource({ getEpisodeDayCounts: vi.fn().mockResolvedValue([{ count: 2, day: 'Viernes' }]) });

      render(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

      const viernesOption = await screen.findByRole('radio', { name: /Friday/ });
      expect(viernesOption).toHaveTextContent('2');
    });

    it('shows no badge element for a day with a zero or absent count', async () => {
      pinToday(new Date(2026, 7, 30, 12, 0, 0));
      const source = createSource({ getEpisodeDayCounts: vi.fn().mockResolvedValue([{ count: 0, day: 'Viernes' }]) });

      render(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

      const viernesOption = await screen.findByRole('radio', { name: 'Friday' });
      expect(viernesOption).toHaveTextContent('Friday');
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
  });

  describe('current day marker', () => {
    it('marks the current weekday tab while a different day is selected', async () => {
      pinToday(new Date(2026, 7, 30, 12, 0, 0));

      render(<EpisodeSchedulePanel initialDay="Lunes" source={createSource()} />);

      const todayTab = await screen.findByRole('radio', { name: 'Sunday, today' });
      expect(todayTab.querySelector('span[aria-hidden="true"]')).toHaveClass('bg-current');
      expect(screen.getByRole('radio', { name: 'Monday' })).toBeInTheDocument();
    });

    it('follows the clock instead of a fixed weekday', async () => {
      pinToday(new Date(2026, 7, 26, 12, 0, 0));

      render(<EpisodeSchedulePanel initialDay="Lunes" source={createSource()} />);

      expect(await screen.findByRole('radio', { name: 'Wednesday, today' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Sunday' })).toBeInTheDocument();
    });
  });
});
