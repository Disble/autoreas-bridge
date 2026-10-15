import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonProviderSearchResult } from '../../../../../../infrastructure/season-source/season-source.types';
import { IntakeProviderLookup } from '../IntakeProviderLookup';

/** The one page the fake provider search returns by default. */
const AO_ASHI = {
  title: 'Ao Ashi Season 2',
  pageUrl: 'https://jkanime.net/ao-ashi-2/',
  provider: 'jkanime',
  imageUrl: 'https://cdn.jkdesa.com/ao-ashi-2.jpg',
};

/**
 * Mounts the lookup for the row "Ao Ashi" over a fake provider search and
 * opens it from its icon trigger, which seeds and fires the first search.
 * @param result What the fake provider search resolves with.
 * @returns The resolve spy and the search spy.
 */
function openLookup(result: SeasonProviderSearchResult = { status: 'ok', pages: [AO_ASHI] }) {
  const onResolve = vi.fn();
  const searchProviders = vi.fn().mockResolvedValue(result);
  render(<IntakeProviderLookup rawName="Ao Ashi" source={{ searchProviders }} onResolve={onResolve} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find on provider' }));
  return { onResolve, searchProviders };
}

describe('IntakeProviderLookup', () => {
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
    const onResolve = vi.fn();
    render(<IntakeProviderLookup rawName="Ao Ashi" source={{ searchProviders: () => new Promise(() => undefined) }} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find on provider' }));

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
      result: { status: 'ok', pages: [] },
      title: 'No provider pages for "Ao Ashi"',
      detail: 'Try a shorter title or a different romanization in the search field above.',
    },
    { result: { status: 'jkanime timed out', pages: [] }, title: 'Provider search failed', detail: 'jkanime timed out' },
  ])('tells "$title" when the search returns no page to pick', async ({ result, title, detail }) => {
    openLookup(result);

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
