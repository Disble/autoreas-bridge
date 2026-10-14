import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANIME_SCHEDULE_WEEK_LOADING_LABEL, ANIME_SCHEDULE_WEEK_SKELETON_COUNT } from '../anime-schedule-card.constants';
import type { AnimeScheduleWeekView } from '../anime-schedule-card.types';
import { AnimeScheduleCard } from '../AnimeScheduleCard';

afterEach(cleanup);

/** A read week: Lunes 3 of 3, Jueves not scheduled. */
const READY: AnimeScheduleWeekView = {
  status: 'ready',
  days: [
    { id: 'Lunes', label: 'Lunes', position: { order: 3, total: 3 }, ariaLabel: 'Lunes: 3 of 3' },
    { id: 'Jueves', label: 'Jueves', ariaLabel: 'Jueves: not scheduled' },
  ],
};

describe('AnimeScheduleCard', () => {
  it('shows the title, the description and one cell per day, tinting the days the anime airs', () => {
    render(<AnimeScheduleCard week={READY} onOpenSchedule={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByText('Days this anime airs. The editor arranges every active anime and applies on its own.')).toBeInTheDocument();
    const strip = screen.getByRole('list', { name: 'Week placement' });
    const aired = within(strip).getByRole('listitem', { name: 'Lunes: 3 of 3' });
    const dimmed = within(strip).getByRole('listitem', { name: 'Jueves: not scheduled' });
    expect(aired).toHaveClass('bg-accent/10');
    expect(within(aired).getByText('3').tagName).toBe('STRONG');
    expect(aired).toHaveTextContent('Lunes3 of 3');
    expect(dimmed).toHaveClass('bg-default/40');
    expect(dimmed).toHaveTextContent(/^Jueves$/);
    // A dimmed day mutes its name; an aired day keeps it at full strength.
    expect(within(dimmed).getByText('Jueves')).toHaveClass('text-muted');
    expect(within(aired).getByText('Lunes')).toHaveClass('text-foreground');
    expect(within(aired).getByText('Lunes')).not.toHaveClass('text-muted');
    expect(screen.queryByRole('status', { name: ANIME_SCHEDULE_WEEK_LOADING_LABEL })).toBeNull();
    expect(screen.queryByText('The schedule could not be loaded.')).toBeNull();
  });

  it('opens the schedule editor from its button', () => {
    const onOpenSchedule = vi.fn();
    render(<AnimeScheduleCard week={READY} onOpenSchedule={onOpenSchedule} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open schedule editor' }));

    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
  });

  it('shows seven skeleton cells in a labelled status region while loading, and no strip', () => {
    render(<AnimeScheduleCard week={{ status: 'loading', days: [] }} onOpenSchedule={vi.fn()} />);

    expect(screen.getByRole('status', { name: ANIME_SCHEDULE_WEEK_LOADING_LABEL })).toBeInTheDocument();
    expect(screen.getAllByTestId('anime-schedule-week-skeleton')).toHaveLength(ANIME_SCHEDULE_WEEK_SKELETON_COUNT);
    expect(screen.queryByRole('list', { name: 'Week placement' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open schedule editor' })).toBeInTheDocument();
  });

  it('shows the failure alert alone: no strip, no skeleton', () => {
    render(<AnimeScheduleCard week={{ status: 'failed', days: [], failureMessage: 'offline' }} onOpenSchedule={vi.fn()} />);

    expect(screen.getByText('The schedule could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Week placement' })).toBeNull();
    expect(screen.queryByRole('status', { name: ANIME_SCHEDULE_WEEK_LOADING_LABEL })).toBeNull();
  });

  it('renders nothing while no anime is selected', () => {
    render(<AnimeScheduleCard week={{ status: 'idle', days: [] }} onOpenSchedule={vi.fn()} />);

    expect(screen.queryByRole('heading', { name: 'Schedule' })).toBeNull();
  });
});
