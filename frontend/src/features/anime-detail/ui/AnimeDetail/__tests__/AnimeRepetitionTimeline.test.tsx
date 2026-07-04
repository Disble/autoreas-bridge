import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AnimeRepetitionTimeline } from '../AnimeRepetitionTimeline';
import type { AnimeRepeticionViewModel } from '../anime-detail.types';

function repetition(overrides: Partial<AnimeRepeticionViewModel> = {}): AnimeRepeticionViewModel {
  return {
    key: '1-0',
    numRepeticion: 1,
    estadoLabel: 'Finalizado',
    estadoColor: 'success',
    episodesWatchedLabel: '24',
    creacionLabel: 'January 1, 2022',
    estrenoLabel: 'January 2, 2022',
    ultCapVistoLabel: 'January 3, 2022',
    eliminacionLabel: 'January 4, 2022',
    repeatedOnLabel: 'June 1, 2023',
    ...overrides,
  };
}

describe('AnimeRepetitionTimeline', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders every entry with its header, estado chip, and full definition grid', () => {
    render(<AnimeRepetitionTimeline repetitions={[repetition()]} />);

    expect(screen.getByText('Repetition 1')).toBeInTheDocument();
    expect(screen.getByText('Finalizado')).toBeInTheDocument();
    expect(screen.getByText('Episodes watched')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('January 1, 2022')).toBeInTheDocument();
    expect(screen.getByText('Premiere')).toBeInTheDocument();
    expect(screen.getByText('January 2, 2022')).toBeInTheDocument();
    expect(screen.getByText('Last watched')).toBeInTheDocument();
    expect(screen.getByText('January 3, 2022')).toBeInTheDocument();
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.getByText('January 4, 2022')).toBeInTheDocument();
    expect(screen.getByText('Next repetition')).toBeInTheDocument();
    expect(screen.getByText('June 1, 2023')).toBeInTheDocument();
  });

  it('renders every entry in the given order without re-sorting', () => {
    render(
      <AnimeRepetitionTimeline
        repetitions={[
          repetition({ key: '2-0', numRepeticion: 2 }),
          repetition({ key: '1-1', numRepeticion: 1 }),
        ]}
      />,
    );

    const headers = screen.getAllByText(/^Repetition \d+$/).map((node) => node.textContent);
    expect(headers).toEqual(['Repetition 2', 'Repetition 1']);
  });

  it('renders the explicit "No data" fallback for absent dates', () => {
    render(
      <AnimeRepetitionTimeline
        repetitions={[
          repetition({
            creacionLabel: 'No data',
            estrenoLabel: 'No data',
            ultCapVistoLabel: 'No data',
            eliminacionLabel: 'No data',
            repeatedOnLabel: 'No data',
          }),
        ]}
      />,
    );

    expect(screen.getAllByText('No data')).toHaveLength(5);
  });

  it('renders an unrecognized estado as the raw fallback label rather than inventing a mapping', () => {
    render(<AnimeRepetitionTimeline repetitions={[repetition({ estadoLabel: '9', estadoColor: 'default' })]} />);

    expect(screen.getByText('9')).toBeInTheDocument();
  });
});
