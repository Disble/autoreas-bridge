import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OVERVIEW_LINEUP_COPY, OVERVIEW_LINEUP_LOADING_LABEL } from '../overview-panel.constants';
import type { OverviewLineupView } from '../overview-panel.types';
import { OverviewFinalLineup } from '../OverviewFinalLineup';
import { useOverviewLineup } from '../use-overview-lineup';

vi.mock('../use-overview-lineup', () => ({ useOverviewLineup: vi.fn() }));

/** Mocked hook each case drives to one lineup state. */
const mockedUseOverviewLineup = vi.mocked(useOverviewLineup);

/** A two-day recorded lineup: one graded anime, one without a grade. */
const LINEUP: OverviewLineupView = {
  display: 'lineup',
  errorMessage: undefined,
  summary: '2 animes, as scheduled when the season closed',
  days: [
    { day: 'Lunes', items: [{ key: 'Lunes-a', animeId: 'a', name: 'Sayonara Lara', grade: 6 }] },
    { day: 'Domingo', items: [{ key: 'Domingo-b', animeId: 'b', name: 'Yani Neko', grade: null }] },
  ],
};

/** Renders the lineup card with the hook returning the given view. */
function renderWith(view: Partial<OverviewLineupView>) {
  mockedUseOverviewLineup.mockReturnValue({
    view: { display: 'loading', errorMessage: undefined, summary: '', days: [], ...view },
    getCoverThumb: () => ({ coverSrc: undefined, isLoading: false }),
  });
  render(<OverviewFinalLineup />);
}

/** Names every display state whose marker is on screen, so a case can prove exactly one renders. */
function visibleStates(): string[] {
  const markers = {
    loading: screen.queryByRole('status', { name: OVERVIEW_LINEUP_LOADING_LABEL }),
    failed: document.querySelector('[data-slot="alert-root"]'),
    unrecorded: screen.queryByText(OVERVIEW_LINEUP_COPY.notRecordedTitle),
    empty: screen.queryByText(OVERVIEW_LINEUP_COPY.emptyTitle),
    lineup: screen.queryByRole('region', { name: OVERVIEW_LINEUP_COPY.regionLabel }),
  };
  return Object.entries(markers)
    .filter(([, marker]) => marker !== null)
    .map(([state]) => state);
}

describe('OverviewFinalLineup', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    { view: { display: 'loading' as const }, want: ['loading'] },
    { view: { display: 'failed' as const, errorMessage: 'boom' }, want: ['failed'] },
    { view: { display: 'unrecorded' as const }, want: ['unrecorded'] },
    { view: { display: 'empty' as const }, want: ['empty'] },
    { view: LINEUP, want: ['lineup'] },
  ])('renders exactly one state for $view.display', ({ view, want }) => {
    renderWith(view);

    expect(visibleStates()).toEqual(want);
  });

  it('shows the read failure message', () => {
    renderWith({ display: 'failed', errorMessage: 'boom' });

    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('lists the recorded lineup per weekday with covers, names and season grades', () => {
    renderWith(LINEUP);

    expect(screen.getByText('2 animes, as scheduled when the season closed')).toBeInTheDocument();
    const monday = screen.getByRole('list', { name: 'Lunes' });
    expect(within(monday).getByText('Sayonara Lara')).toBeInTheDocument();
    expect(within(monday).getByLabelText('Approval grade 6')).toHaveTextContent('6');
    expect(within(monday).getByTestId('season-cover-thumb')).toBeInTheDocument();
    const sunday = screen.getByRole('list', { name: 'Domingo' });
    expect(within(sunday).getByText('Yani Neko')).toBeInTheDocument();
    expect(within(sunday).queryByLabelText(/Approval grade/)).toBeNull();
    expect(within(sunday).getByText('No grade')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
