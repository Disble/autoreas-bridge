import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeasonProviderSearchResult } from '../../../../../../shared/contracts/season.types';
import { createModulesTestWrapper } from '../../../../../../shared/query/test-support/bridge-modules.test-support';
import { IntakeProviderLookup } from '../IntakeProviderLookup';

/** The default season port's provider search read, which each case programs. */
const fetchProviderSearch = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../shared/query/bridge-runtime/bridge-runtime.constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  /** The lookup's default season port. */
  BRIDGE_SEASON_SOURCE: { fetchProviderSearch },
}));

/** The one page the fake provider search returns by default. */
const AO_ASHI = {
  title: 'Ao Ashi Season 2',
  pageUrl: 'https://jkanime.net/ao-ashi-2/',
  provider: 'jkanime',
  imageUrl: 'https://cdn.jkdesa.com/ao-ashi-2.jpg',
};

/**
 * Mounts the lookup for the row "Ao Ashi" with the season module ready and
 * opens it from its icon trigger, which seeds and fires the first search.
 * @returns The resolve spy.
 */
function openLookup() {
  const onResolve = vi.fn();
  const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
  render(<IntakeProviderLookup rawName="Ao Ashi" onResolve={onResolve} />, { wrapper });
  fireEvent.click(screen.getByRole('button', { name: 'Find on provider' }));
  return { onResolve };
}

describe('IntakeProviderLookup', () => {
  beforeEach(() => {
    fetchProviderSearch.mockReset().mockResolvedValue({ status: 'ok', pages: [AO_ASHI] } satisfies SeasonProviderSearchResult);
  });

  afterEach(() => {
    cleanup();
  });

  it('opens "Find on provider" with its search field seeded from the row name', () => {
    openLookup();

    expect(screen.getByRole('heading', { name: 'Find on provider' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search providers' })).toHaveValue('Ao Ashi');
    expect(screen.getByPlaceholderText('Search providers...')).toBeInTheDocument();
  });

  it('announces the in-flight search as "Searching providers..."', async () => {
    fetchProviderSearch.mockReturnValue(new Promise(() => undefined));
    openLookup();

    expect(await screen.findByRole('status', { name: 'Searching providers...' })).toBeInTheDocument();
  });

  it('lists each provider page by title and cover, with its provider label and schemeless URL', async () => {
    openLookup();

    const list = await screen.findByLabelText('Provider pages');

    expect(list).toHaveTextContent('Ao Ashi Season 2');
    expect(list).toHaveTextContent('JKAnime · jkanime.net/ao-ashi-2/');
    // The cover is decorative (`alt=""`), so it has no accessible img role.
    expect(list.querySelector('img')).toHaveAttribute('src', 'https://cdn.jkdesa.com/ao-ashi-2.jpg');
  });

  it.each([
    {
      search: () => Promise.resolve({ status: 'ok', pages: [] }),
      title: 'No provider pages for "Ao Ashi"',
      detail: 'Try a shorter title or a different romanization in the search field above.',
    },
    { search: () => Promise.reject(new Error('jkanime timed out')), title: 'Provider search failed', detail: 'jkanime timed out' },
  ])('tells "$title" when the search returns no page to pick', async ({ search, title, detail }) => {
    fetchProviderSearch.mockImplementation(search);
    openLookup();

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
    expect(screen.queryByLabelText('Provider pages')).toBeNull();
  });

  it('resolves the row to the picked page with "Use this page" and closes', async () => {
    const { onResolve } = openLookup();
    const confirm = screen.getByRole('button', { name: 'Use this page' });

    expect(confirm).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: /Ao Ashi Season 2/ }));
    expect(onResolve).not.toHaveBeenCalled();
    fireEvent.click(confirm);

    expect(onResolve).toHaveBeenCalledExactlyOnceWith(AO_ASHI.pageUrl);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes on Cancel without resolving the row', async () => {
    const { onResolve } = openLookup();

    fireEvent.click(await screen.findByRole('button', { name: /Ao Ashi Season 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onResolve).not.toHaveBeenCalled();
  });
});
