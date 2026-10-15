import { describe, expect, it, vi } from 'vitest';

import { SEASON_RUNTIME_UNAVAILABLE } from '../../../../../../infrastructure/season-source/season-source.constants';
import type { SeasonProviderPage } from '../../../../../../infrastructure/season-source/season-source.types';
import {
  canFindOnProvider,
  requestProviderSearch,
  toProviderLookupSnapshot,
  toProviderPageViews,
} from '../intake-provider-lookup.helpers';

/**
 * Builds one provider page, so a case states only the fields it is about.
 * @param overrides Per-case page replacements.
 * @returns A JKAnime page.
 */
function page(overrides: Partial<SeasonProviderPage> = {}): SeasonProviderPage {
  return { title: 'Ao Ashi', pageUrl: 'https://jkanime.net/ao-ashi/', provider: 'jkanime', ...overrides };
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
    { result: { status: 'ok', pages: [page()] }, snapshot: { state: 'resolved', pages: [page()], errorMessage: '' } },
    { result: { status: 'ok', pages: [] }, snapshot: { state: 'resolved', pages: [], errorMessage: '' } },
    { result: { status: 'jkanime timed out', pages: [] }, snapshot: { state: 'failed', pages: [], errorMessage: 'jkanime timed out' } },
  ])('maps the "$result.status" search status onto the $snapshot.state lookup state', ({ result, snapshot }) => {
    expect(toProviderLookupSnapshot(result)).toStrictEqual(snapshot);
  });

  it('asks the port for the query when it can search', async () => {
    const searchProviders = vi.fn().mockResolvedValue({ status: 'ok', pages: [page()] });

    await expect(requestProviderSearch({ searchProviders }, 'ao ashi')).resolves.toStrictEqual({ status: 'ok', pages: [page()] });
    expect(searchProviders).toHaveBeenCalledExactlyOnceWith('ao ashi');
  });

  it('reads a port without a provider search as unavailable, never as no pages', async () => {
    await expect(requestProviderSearch({}, 'ao ashi')).resolves.toStrictEqual({ status: SEASON_RUNTIME_UNAVAILABLE, pages: [] });
  });
});
