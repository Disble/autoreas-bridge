import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpisodeSchedulePanel } from '../EpisodeSchedulePanel';
import type { EpisodeScheduleSource } from '../episode-schedule-panel.types';

/**
 * Mounts the panel on the routed surface it occupies in production, with a
 * probe on the Create destination so the empty state's navigation is observable
 * rather than mocked.
 */
function renderPanel(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <Routes>
        <Route element={ui} path="/today" />
        <Route element={<h2>Create workspace</h2>} path="/editor/create" />
      </Routes>
    </MemoryRouter>,
  );
}

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

    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

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

    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

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

    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

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

    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

    expect(await screen.findByRole('heading', { name: 'Paused' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add one episode for Paused. Secondary click adds half episode.' })).toBeDisabled();
  });

  describe('view lens toggle', () => {
    it('switches the filter row from season lenses to weekdays when Daily is selected, with season mode on', async () => {
      const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });

      renderPanel(<EpisodeSchedulePanel source={source} />);

      expect(await screen.findByRole('radio', { name: /Sin ver/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('radio', { name: 'Daily' }));

      expect(await screen.findByRole('radio', { name: /Monday/ })).toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: /Sin ver/ })).not.toBeInTheDocument();
    });
  });

  describe('day count badges', () => {
    it('shows a count badge on a day ToggleButton with qualifying entries', async () => {
      const source = createSource({ getEpisodeDayCounts: vi.fn().mockResolvedValue([{ count: 2, day: 'Viernes' }]) });

      renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

      const viernesOption = await screen.findByRole('radio', { name: /Friday/ });
      expect(viernesOption).toHaveTextContent('2');
    });

    it('shows no badge element for a day with a zero or absent count', async () => {
      pinToday(new Date(2026, 7, 30, 12, 0, 0));
      const source = createSource({ getEpisodeDayCounts: vi.fn().mockResolvedValue([{ count: 0, day: 'Viernes' }]) });

      renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

      const viernesOption = await screen.findByRole('radio', { name: 'Friday' });
      expect(viernesOption).toHaveTextContent('Friday');
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
  });

  describe('current day marker', () => {
    it('marks the current weekday tab while a different day is selected', async () => {
      pinToday(new Date(2026, 7, 30, 12, 0, 0));

      renderPanel(<EpisodeSchedulePanel initialDay="Lunes" source={createSource()} />);

      const todayTab = await screen.findByRole('radio', { name: 'Sunday, today' });
      expect(todayTab.querySelector('span[aria-hidden="true"]')).toHaveClass('bg-current');
      expect(screen.getByRole('radio', { name: 'Monday' })).toBeInTheDocument();
    });

    it('follows the clock instead of a fixed weekday', async () => {
      pinToday(new Date(2026, 7, 26, 12, 0, 0));

      renderPanel(<EpisodeSchedulePanel initialDay="Lunes" source={createSource()} />);

      expect(await screen.findByRole('radio', { name: 'Wednesday, today' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Sunday' })).toBeInTheDocument();
    });
  });
});

describe('EpisodeSchedulePanel resolved-empty guidance', () => {
  it('guides creation with day context once the schedule resolves with no rows', async () => {
    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={createSource()} />);

    expect(await screen.findByText('Nothing scheduled for Friday')).toBeInTheDocument();
    expect(screen.getByText('No active anime are scheduled for Friday. Create one to put it on your schedule.')).toBeInTheDocument();

    const image = document.querySelector('img[aria-hidden="true"]');
    if (image === null) {
      throw new Error('Expected the Today Airis artwork.');
    }
    expect(image).toHaveAttribute('width', '512');
  });

  it('names the season lens instead of a weekday when the season lens is selected', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });

    renderPanel(<EpisodeSchedulePanel source={source} />);

    expect(await screen.findByText('Nothing in Ver hoy')).toBeInTheDocument();
  });

  it('navigates to the Create workspace when Create an anime is pressed', async () => {
    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={createSource()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create an anime' }));

    expect(await screen.findByRole('heading', { name: 'Create workspace' })).toBeInTheDocument();
  });

  it('keeps the day and lens controls available while the empty state shows', async () => {
    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={createSource()} />);

    expect(await screen.findByRole('button', { name: 'Create an anime' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Friday/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Daily' })).toBeInTheDocument();
  });

  it('shows loading feedback instead of empty guidance while the request is unresolved', async () => {
    const source = createSource({ getEpisodeSchedule: vi.fn().mockReturnValue(new Promise(() => undefined)) });

    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

    expect(await screen.findByRole('status', { name: 'Loading the schedule...' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create an anime' })).toBeNull();
    expect(document.querySelector('img[aria-hidden="true"]')).toBeNull();
  });

  it('renders exactly three placeholder rows while the schedule request is unresolved', async () => {
    const source = createSource({ getEpisodeSchedule: vi.fn().mockReturnValue(new Promise(() => undefined)) });

    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

    await screen.findByRole('status', { name: 'Loading the schedule...' });
    expect(screen.getAllByTestId('episode-schedule-skeleton-row')).toHaveLength(3);
  });

  it('shows the failure alert instead of empty guidance when the request rejects', async () => {
    const source = createSource({ getEpisodeSchedule: vi.fn().mockRejectedValue(new Error('binding missing')) });

    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

    expect(await screen.findByText('Episode schedule unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create an anime' })).toBeNull();
    expect(document.querySelector('img[aria-hidden="true"]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('episode-schedule-skeleton-row')).toBeNull();
  });
});

describe('EpisodeSchedulePanel resolved-non-empty precedence', () => {
  it('shows the rows and no empty guidance once the schedule resolves with anime', async () => {
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
    });

    renderPanel(<EpisodeSchedulePanel initialDay="Viernes" source={source} />);

    expect(await screen.findByRole('heading', { name: 'Frieren' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create an anime' })).toBeNull();
    expect(document.querySelector('img[aria-hidden="true"]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('episode-schedule-skeleton-row')).toBeNull();
  });
});

describe('EpisodeSchedulePanel loading exclusivity', () => {
  it('never shows placeholder rows beside real ones while a later day is still loading', async () => {
    const getEpisodeSchedule = vi.fn()
      .mockResolvedValueOnce([
        {
          animeId: 'anime-1',
          animeName: 'Youjo Senki II',
          day: 'Lunes',
          dayOrder: 1,
          status: 0,
          hasCover: false,
          modified_at: 1000,
          episodesWatched: 8,
          totalEpisodes: 12,
        },
      ])
      .mockReturnValue(new Promise(() => undefined));
    const source = createSource({ getEpisodeSchedule });

    renderPanel(<EpisodeSchedulePanel initialDay="Lunes" source={source} />);

    expect(await screen.findByRole('heading', { name: 'Youjo Senki II' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Friday/ }));

    expect(await screen.findByRole('status', { name: 'Loading the schedule...' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Youjo Senki II' })).toBeNull();
  });
});
