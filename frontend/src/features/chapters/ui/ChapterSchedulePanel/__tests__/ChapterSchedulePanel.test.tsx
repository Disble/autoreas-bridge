import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChapterSchedulePanel } from '../ChapterSchedulePanel';
import type { ChapterScheduleSource } from '../chapter-schedule-panel.types';

describe('ChapterSchedulePanel', () => {
  it('renders scheduled anime and exposes chapter adjustment actions', async () => {
    const adjustWatchedChapters = vi.fn().mockResolvedValue({ status: 'ok' });
    const source: ChapterScheduleSource = {
      adjustWatchedChapters,
      getChapterSchedule: vi.fn().mockResolvedValue([
        {
          animeId: 'anime-1',
          animeName: 'Frieren',
          day: 'Viernes',
          dayOrder: 1,
          estado: 0,
          hasFolder: true,
          hasPage: true,
          modified_at: 1000,
          nrocapvisto: 10.5,
          totalcap: 28,
        },
      ]),
      setAnimeState: vi.fn(),
    };

    render(<ChapterSchedulePanel initialDay="Viernes" source={source} />);

    expect(await screen.findByText('Frieren')).toBeInTheDocument();
    expect(screen.getByText('10.5 watched')).toBeInTheDocument();
    expect(screen.getByText('17.5 remaining')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add half chapter for Frieren' }));

    await waitFor(() => expect(adjustWatchedChapters).toHaveBeenCalledWith('anime-1', 0.5, 1000));
  });

  it('disables progress buttons for paused/completed/dropped anime', async () => {
    const source: ChapterScheduleSource = {
      adjustWatchedChapters: vi.fn(),
      getChapterSchedule: vi.fn().mockResolvedValue([
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
      ]),
      setAnimeState: vi.fn(),
    };

    render(<ChapterSchedulePanel initialDay="Viernes" source={source} />);

    expect(await screen.findByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add one chapter for Paused' })).toBeDisabled();
  });
});
