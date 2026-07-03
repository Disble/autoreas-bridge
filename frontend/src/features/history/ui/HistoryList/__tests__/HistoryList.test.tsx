import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { HistoryList } from '../HistoryList';
import * as useHistoryListModule from '../use-history-list';
import type { HistoryListState } from '../history-list.types';

function mockState(overrides: Partial<HistoryListState>): HistoryListState {
  return {
    items: [],
    isLoading: false,
    isEmpty: true,
    ...overrides,
  };
}

describe('HistoryList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a loading indicator while the hook reports loading', () => {
    vi.spyOn(useHistoryListModule, 'useHistoryList').mockReturnValue(mockState({ isLoading: true, isEmpty: false }));

    render(
      <MemoryRouter>
        <HistoryList />
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading history...')).toBeInTheDocument();
  });

  it('renders the empty state when there are no qualifying entries', () => {
    vi.spyOn(useHistoryListModule, 'useHistoryList').mockReturnValue(
      mockState({ isLoading: false, isEmpty: true, items: [] }),
    );

    render(
      <MemoryRouter>
        <HistoryList />
      </MemoryRouter>,
    );

    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });

  it('renders progress and repetition count per entry, and links to the shared detail route', () => {
    vi.spyOn(useHistoryListModule, 'useHistoryList').mockReturnValue(
      mockState({
        isLoading: false,
        isEmpty: false,
        items: [
          {
            id: 'anime-1',
            nombre: 'Frieren',
            progressLabel: '12 / 28',
            repetitionCount: 2,
            repetitions: [
              { key: '1-0', numRepeticion: 1, repeatedOnLabel: '2023-01-01' },
              { key: '2-1', numRepeticion: 2, repeatedOnLabel: 'Unknown' },
            ],
          },
        ],
      }),
    );

    render(
      <MemoryRouter>
        <HistoryList />
      </MemoryRouter>,
    );

    expect(screen.getByText('Frieren')).toBeInTheDocument();
    expect(screen.getByText('12 / 28')).toBeInTheDocument();
    expect(screen.getByText('2 repetitions')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Frieren/ })).toHaveAttribute('href', '/catalog/detail/anime-1');
  });

  it('uses singular "repetition" copy for exactly one entry', () => {
    vi.spyOn(useHistoryListModule, 'useHistoryList').mockReturnValue(
      mockState({
        isLoading: false,
        isEmpty: false,
        items: [
          {
            id: 'anime-2',
            nombre: 'Bocchi the Rock',
            progressLabel: '12 / 12',
            repetitionCount: 1,
            repetitions: [{ key: '1-0', numRepeticion: 1, repeatedOnLabel: '2023-01-01' }],
          },
        ],
      }),
    );

    render(
      <MemoryRouter>
        <HistoryList />
      </MemoryRouter>,
    );

    expect(screen.getByText('1 repetition')).toBeInTheDocument();
  });
});
