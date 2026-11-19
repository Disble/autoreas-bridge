import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../../../../infrastructure/bridge-runtime-source/anime-source.helpers', () => ({
  createAnimeSource: () => mockSource,
}));

import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { CatalogPanel } from '../CatalogPanel';

beforeEach(() => {
  resetCatalogSession();
});

afterEach(cleanup);

/**
 * The results list, a `ul` named "Anime catalog"; the skeleton list carries no name. A selector, not
 * `getByRole`: it skips the role query's costly accessibility pass over the whole catalog on every poll.
 * @returns The list, or null before the catalog resolved.
 */
function resultsList(): HTMLUListElement | null {
  return document.querySelector<HTMLUListElement>('ul[aria-label="Anime catalog"]');
}

/**
 * Counts the anime mounted in the results, never the skeleton placeholders.
 * @returns How many anime items the results list holds.
 */
function countRenderedAnime(): number {
  return resultsList()?.querySelectorAll('li').length ?? 0;
}

describe('CatalogPanel progressive window (400 anime)', () => {
  it.each<CatalogView>(['grid', 'list'])('renders one batch in the %s view, then grows as the page scrolls — never the whole catalog', async (view) => {
    catalogSessionStore.setState({ view });
    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
      createModulesTestWrapper({ module: 'anime', state: 'ready' }),
    );

    await waitFor(() => expect(resultsList()).toBeInTheDocument());
    expect(countRenderedAnime()).toBe(20); // PROGRESSIVE_LIST_INITIAL_COUNT

    fireEvent.scroll(window);
    await waitFor(() => expect(countRenderedAnime()).toBe(40));

    fireEvent.scroll(window);
    await waitFor(() => expect(countRenderedAnime()).toBe(60));
    expect(screen.getByText('Showing 60 of 400 — scroll for more')).toBeInTheDocument();
  });
});
