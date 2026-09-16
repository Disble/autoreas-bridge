import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ANIME_WATCH_SUMMARY_TESTID } from '../anime-watch-history.constants';
import type { AnimeWatchSummary as AnimeWatchSummaryData } from '../anime-watch-history.types';
import { AnimeWatchSummary } from '../AnimeWatchSummary';

/** Builds a representative pre-log summary, as derived from a pre-log repetition record. */
function createSummary(): AnimeWatchSummaryData {
  return {
    started: 'August 16, 2021',
    premiere: 'July 3, 2021',
    lastWatched: 'September 1, 2021',
    ended: 'September 8, 2021',
  };
}

describe('AnimeWatchSummary', () => {
  it('renders the four dashed summary rows with their record values, scoped to the watch', () => {
    render(<AnimeWatchSummary watchNumber={1} summary={createSummary()} />);

    expect(screen.getByTestId(`${ANIME_WATCH_SUMMARY_TESTID}-1`)).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('August 16, 2021')).toBeInTheDocument();
    expect(screen.getByText('Premiere')).toBeInTheDocument();
    expect(screen.getByText('July 3, 2021')).toBeInTheDocument();
    expect(screen.getByText('Last watched')).toBeInTheDocument();
    expect(screen.getByText('September 1, 2021')).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.getByText('September 8, 2021')).toBeInTheDocument();
    expect(screen.getByText(/This watch ended before watch history existed/)).toBeInTheDocument();
  });

  it('renders no episode rows, since a pre-log watch owns no logged episodes', () => {
    render(<AnimeWatchSummary watchNumber={1} summary={createSummary()} />);

    expect(screen.queryByText(/Episode \d+/)).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
