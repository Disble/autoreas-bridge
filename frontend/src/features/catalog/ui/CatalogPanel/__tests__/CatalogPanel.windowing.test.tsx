import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogView } from '../catalog-panel.types';
import { catalogSessionStore, resetCatalogSession } from '../catalog-session.store';

/** A runtime source resolving 400 cover-less anime, enough for several windows. */
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
    hasCover: false,
  }));

  return { mockSource: { getAnimes: vi.fn().mockResolvedValue(animes) } };
});

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: mockSource,
}));

import { CatalogPanel } from '../CatalogPanel';

beforeEach(() => {
  resetCatalogSession();
});

afterEach(cleanup);

/**
 * Counts the anime rendered in the results, never the skeleton placeholders.
 * @returns How many anime the results list holds.
 */
function countRenderedAnime(): number {
  return within(screen.getByRole('list', { name: 'Anime catalog' })).getAllByRole('listitem').length;
}

describe('CatalogPanel progressive window (400 anime)', () => {
  it.each<CatalogView>(['grid', 'list'])('renders one batch in the %s view, then grows as the page scrolls — never the whole catalog', async (view) => {
    catalogSessionStore.setState({ view });
    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('list', { name: 'Anime catalog' })).toBeInTheDocument());
    expect(countRenderedAnime()).toBe(20); // PROGRESSIVE_LIST_INITIAL_COUNT

    fireEvent.scroll(window);
    await waitFor(() => expect(countRenderedAnime()).toBe(40));

    fireEvent.scroll(window);
    await waitFor(() => expect(countRenderedAnime()).toBe(60));
    expect(screen.getByText('Showing 60 of 400 — scroll for more')).toBeInTheDocument();
  });
});
