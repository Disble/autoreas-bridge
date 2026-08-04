import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockSource } = vi.hoisted(() => {
  const animes = Array.from({ length: 400 }, (_, index) => ({
    id: `anime-${index}`,
    name: `Anime ${String(index).padStart(4, '0')}`,
    status: 0,
    active: 1,
    episodesWatched: index,
    totalEpisodes: 12,
    kind: 0,
    days: ['Lunes'],
    genres: ['Action'],
    hasDownloadPage: true,
    hasFolder: true,
  }));

  return { mockSource: { getAnimes: vi.fn().mockResolvedValue(animes) } };
});

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: mockSource,
}));

import { CatalogPanel } from '../CatalogPanel';

afterEach(cleanup);

function countRows() {
  return screen.getAllByRole('listitem').length;
}

describe('CatalogPanel progressive list (400 items)', () => {
  it('renders only the first batch initially, then grows on scroll — never the whole catalog at once', async () => {
    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('catalog-list-scroll')).toBeInTheDocument());

    expect(countRows()).toBe(20); // PROGRESSIVE_LIST_INITIAL_COUNT

    fireEvent.scroll(screen.getByTestId('catalog-list-scroll'));
    await waitFor(() => expect(countRows()).toBe(40));

    fireEvent.scroll(screen.getByTestId('catalog-list-scroll'));
    await waitFor(() => expect(countRows()).toBe(60));

    expect(countRows()).toBeLessThan(400);
  });
});
