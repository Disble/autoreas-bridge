import { describe, expect, it, vi } from 'vitest';

import type { SeasonProviderPage } from '../../../../../../shared/contracts/season.types';
import { createBridgeError } from '../../../../../../shared/query/bridge-error/bridge-error.helpers';
import {
  canFindOnProvider,
  fetchProviderSearch,
  nextProviderSearch,
  toProviderLookupSnapshot,
  toProviderPageViews,
} from '../intake-provider-lookup.helpers';
import type { ProviderSearchRead } from '../intake-provider-lookup.types';

/**
 * Builds one provider page, so a case states only the fields it is about.
 * @param overrides Per-case page replacements.
 * @returns A JKAnime page.
 */
function page(overrides: Partial<SeasonProviderPage> = {}): SeasonProviderPage {
  return { title: 'Ao Ashi', pageUrl: 'https://jkanime.net/ao-ashi/', provider: 'jkanime', ...overrides };
}

/**
 * Builds the search read a case is about, settled with one page unless overridden.
 * @param overrides Per-case read replacements.
 * @returns A provider search read.
 */
function read(overrides: Partial<ProviderSearchRead> = {}): ProviderSearchRead {
  return { status: 'success', data: { status: 'ok', pages: [page()] }, error: null, isFetching: false, isPlaceholderData: false, ...overrides };
}

describe('intake provider lookup helpers', () => {
  it.each([
    { matchStatus: 'not_found', expected: true },
    { matchStatus: 'ambiguous', expected: true },
    { matchStatus: 'search_failed', expected: true },
    { matchStatus: 'pending', expected: true },
    { matchStatus: 'matched', expected: false },
    { matchStatus: 'discarded', expected: false },
  ])('offers the provider lookup to a $matchStatus row: $expected', ({ matchStatus, expected }) => {
    expect(canFindOnProvider(matchStatus)).toBe(expected);
  });

  it.each([
    { provider: 'jkanime', pageUrl: 'https://jkanime.net/ao-ashi/', subtitle: 'JKAnime · jkanime.net/ao-ashi/' },
    { provider: 'animeflv', pageUrl: 'http://animeflv.net/anime/ao-ashi', subtitle: 'animeflv · animeflv.net/anime/ao-ashi' },
    { provider: 'jkanime', pageUrl: 'jkanime.net/ao-ashi/?from=https://t.co', subtitle: 'JKAnime · jkanime.net/ao-ashi/?from=https://t.co' },
  ])('describes the $pageUrl page as its provider label and schemeless URL', ({ provider, pageUrl, subtitle }) => {
    const [view] = toProviderPageViews([page({ provider, pageUrl })], 'Ao Ashi', null);

    expect(view.subtitle).toBe(subtitle);
  });

  it('ranks the pages by title against the query, keeps each cover, and marks only the selected one', () => {
    const pages = [
      page({ title: 'Starmyu 2nd Season', pageUrl: 'https://jkanime.net/starmyu-2/', imageUrl: '' }),
      page({ title: 'Ao Ashi Season 2', pageUrl: 'https://jkanime.net/ao-ashi-2/', imageUrl: 'https://cdn.jkdesa.com/ao-ashi-2.jpg' }),
    ];

    const views = toProviderPageViews(pages, 'Ao Ashi Season 2', 'https://jkanime.net/starmyu-2/');

    expect(views.map((view) => [view.title, view.image, view.isSelected])).toStrictEqual([
      ['Ao Ashi Season 2', 'https://cdn.jkdesa.com/ao-ashi-2.jpg', false],
      ['Starmyu 2nd Season', undefined, true],
    ]);
  });

  it.each([
    { name: 'a settled search', query: 'ao ashi', search: read(), snapshot: { state: 'resolved', pages: [page()], errorMessage: '' } },
    { name: 'a search that found nothing', query: 'ao ashi', search: read({ data: { status: 'ok', pages: [] } }), snapshot: { state: 'resolved', pages: [], errorMessage: '' } },
    { name: 'a search in flight', query: 'ao ashi', search: read({ status: 'pending', data: undefined, isFetching: true }), snapshot: { state: 'loading', pages: [], errorMessage: '' } },
    { name: 'a newer search over the previous pages', query: 'ao ashi', search: read({ isFetching: true, isPlaceholderData: true }), snapshot: { state: 'loading', pages: [], errorMessage: '' } },
    {
      name: 'a rejected search',
      query: 'ao ashi',
      search: read({ status: 'error', data: undefined, error: createBridgeError('failed_precondition', 'season failed to start') }),
      snapshot: { state: 'failed', pages: [], errorMessage: 'season failed to start' },
    },
    { name: 'a query below the length floor', query: 'ao', search: read(), snapshot: { state: 'idle', pages: [], errorMessage: '' } },
  ])('maps $name onto the $snapshot.state lookup state', ({ query, search, snapshot }) => {
    expect(toProviderLookupSnapshot(query, search)).toStrictEqual(snapshot);
  });

  it('turns each settled debounce into a new search of the normalized query', () => {
    expect(nextProviderSearch({ query: 'ao ashi', seq: 4 }, '  Ao   Ashi ')).toStrictEqual({ query: 'ao ashi', seq: 5 });
  });

  it('asks the port for the query when it can search', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 'ok', pages: [page()] });

    await expect(fetchProviderSearch({ fetchProviderSearch: fetch }, 'ao ashi')).resolves.toStrictEqual({ status: 'ok', pages: [page()] });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('ao ashi');
  });

  it('rejects for a port without a provider search, never resolving as no pages', async () => {
    await expect(fetchProviderSearch({}, 'ao ashi')).rejects.toThrow('the season source cannot search the providers');
  });
});
