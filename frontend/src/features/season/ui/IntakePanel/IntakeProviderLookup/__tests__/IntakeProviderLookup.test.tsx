import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeasonProviderSearchResult } from '../../../../../../shared/contracts/season.types';
import { createModulesTestWrapper } from '../../../../../../shared/query/test-support/bridge-modules.test-support';
import { IntakeProviderLookup } from '../IntakeProviderLookup';
import type { ModuleReadiness } from '../../../../../../shared/contracts/readiness.types';
import { METADATA_LOOKUP_DEBOUNCE_MS } from '../../../../../../shared/metadata-lookup/metadata-lookup.constants';
import type { ProviderSearchPort } from '../intake-provider-lookup.types';
import { useIntakeProviderLookup } from '../use-intake-provider-lookup';

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
 * opens it from its icon trigger, which seeds the first search; the fake clock
 * then jumps past the search debounce so the search fires at once.
 * @returns The resolve spy.
 */
function openLookup() {
  const onResolve = vi.fn();
  const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
  render(<IntakeProviderLookup rawName="Ao Ashi" onResolve={onResolve} />, { wrapper });
  fireEvent.click(screen.getByRole('button', { name: 'Find on provider' }));
  act(() => {
    vi.advanceTimersByTime(METADATA_LOOKUP_DEBOUNCE_MS);
  });
  return { onResolve };
}

describe('IntakeProviderLookup', () => {
  beforeEach(() => {
    // A clock that still ticks with real time, so `findBy` keeps polling while
    // `openLookup` jumps past the search debounce.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchProviderSearch.mockReset().mockResolvedValue({ status: 'ok', pages: [AO_ASHI] } satisfies SeasonProviderSearchResult);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

/** The page URL the fake provider search returns for "Ao Ashi". */
const AO_ASHI_URL = 'https://jkanime.net/ao-ashi/';

/** The season module, ready to serve the search. */
const SEASON_READY: ModuleReadiness = { module: 'season', state: 'ready' };

/**
 * Builds one successful search result holding one page per title.
 * @param titles The page titles the fake provider "found".
 * @returns An `ok` provider search result.
 */
function found(...titles: readonly string[]): SeasonProviderSearchResult {
  return {
    status: 'ok',
    pages: titles.map((title) => ({ title, pageUrl: `https://jkanime.net/${title.toLowerCase().replace(/ /g, '-')}/`, provider: 'jkanime' })),
  };
}

/**
 * Mounts the hook over a fake port for the row named "Ao Ashi", with the
 * season module in the given state.
 * @param fetchProviderSearch The port's search read.
 * @param season The season module's readiness.
 * @returns The hook handle, the resolve spy and the readiness `emit`.
 */
function renderLookup(
  fetchProviderSearch: ProviderSearchPort['fetchProviderSearch'] = vi.fn().mockResolvedValue(found('Ao Ashi')),
  season: ModuleReadiness = SEASON_READY,
) {
  const onResolve = vi.fn();
  const { wrapper, emit } = createModulesTestWrapper(season);
  const hook = renderHook(() => useIntakeProviderLookup('Ao Ashi', onResolve, { fetchProviderSearch }), { wrapper });
  return { ...hook, onResolve, emit };
}

/**
 * Runs `step` inside `act`, then, in a second `act` after React rendered what
 * it changed, lets the query settle and deliver its notifications, which it
 * schedules on zero-delay timers.
 * @param step What happens first, such as settling a fake search.
 */
async function actAndFlush(step: () => unknown): Promise<void> {
  await act(async () => {
    await step();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Lets the debounce elapse and the search it starts settle. */
async function settleSearch(): Promise<void> {
  await actAndFlush(() => vi.advanceTimersByTimeAsync(METADATA_LOOKUP_DEBOUNCE_MS));
}

describe('useIntakeProviderLookup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('seeds the search from the row name on the first open only, after the debounce', async () => {
    const search = vi.fn().mockResolvedValue(found('Ao Ashi'));
    const { result } = renderLookup(search);
    expect(result.current.query).toBe('');

    act(() => result.current.onOpenChange(true));
    expect(result.current.query).toBe('Ao Ashi');
    expect(result.current.isOpen).toBe(true);
    act(() => vi.advanceTimersByTime(METADATA_LOOKUP_DEBOUNCE_MS - 1));
    expect(search).not.toHaveBeenCalled();
    await settleSearch();
    expect(search).toHaveBeenCalledExactlyOnceWith('ao ashi');

    act(() => result.current.onQueryChange('Ao Ashi Season 2'));
    act(() => result.current.onOpenChange(false));
    act(() => result.current.onOpenChange(true));

    expect(result.current.query).toBe('Ao Ashi Season 2');
  });

  it('seeds and searches with the row name and port of the latest render', async () => {
    const first = vi.fn().mockResolvedValue(found('Ao Ashi'));
    const latest = vi.fn().mockResolvedValue(found('Ao Ashi'));
    const { wrapper } = createModulesTestWrapper(SEASON_READY);
    const { result, rerender } = renderHook(
      ({ name, fetchProviderSearch }) => useIntakeProviderLookup(name, vi.fn(), { fetchProviderSearch }),
      { initialProps: { name: 'Aoashi', fetchProviderSearch: first }, wrapper },
    );

    rerender({ name: 'Ao Ashi', fetchProviderSearch: latest });
    act(() => result.current.onOpenChange(true));
    await settleSearch();

    expect(result.current.query).toBe('Ao Ashi');
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledExactlyOnceWith('ao ashi');
  });

  it('fires no pending search once the lookup unmounts', () => {
    const search = vi.fn().mockResolvedValue(found('Ao Ashi'));
    const { result, unmount } = renderLookup(search);

    act(() => result.current.onQueryChange('Ao Ashi'));
    unmount();
    vi.advanceTimersByTime(METADATA_LOOKUP_DEBOUNCE_MS);

    expect(search).not.toHaveBeenCalled();
  });

  it('shows the loading state while a search is in flight, then the resolved pages', async () => {
    let settle!: (result: SeasonProviderSearchResult) => void;
    const { result } = renderLookup(vi.fn().mockReturnValue(new Promise((resolve) => { settle = resolve; })));

    act(() => result.current.onQueryChange('Ao Ashi'));
    await settleSearch();
    expect(result.current.state).toBe('loading');
    expect(result.current.hasPages).toBe(false);

    await actAndFlush(() => settle(found('Ao Ashi')));

    expect(result.current.state).toBe('resolved');
    expect(result.current.pages.map((view) => view.title)).toStrictEqual(['Ao Ashi']);
    expect(result.current.hasPages).toBe(true);
  });

  it('surfaces a rejected search as the failure message', async () => {
    const { result } = renderLookup(vi.fn().mockRejectedValue(new Error('jkanime timed out')));

    act(() => result.current.onQueryChange('Ao Ashi'));
    await settleSearch();

    expect(result.current.state).toBe('failed');
    expect(result.current.errorMessage).toBe('jkanime timed out');
  });

  it('stays loading without searching while the season module starts, then searches once it is ready', async () => {
    const search = vi.fn().mockResolvedValue(found('Ao Ashi'));
    const { result, emit } = renderLookup(search, { module: 'season', state: 'starting' });

    act(() => result.current.onQueryChange('Ao Ashi'));
    await settleSearch();
    expect(result.current.state).toBe('loading');
    expect(search).not.toHaveBeenCalled();

    await actAndFlush(() => emit(SEASON_READY));

    expect(search).toHaveBeenCalledExactlyOnceWith('ao ashi');
    expect(result.current.state).toBe('resolved');
  });

  it('shows the season module failure without searching once the module failed', async () => {
    const search = vi.fn().mockResolvedValue(found('Ao Ashi'));
    const { result } = renderLookup(search, { module: 'season', state: 'failed', reason: 'season store is corrupt' });

    act(() => result.current.onQueryChange('Ao Ashi'));
    await settleSearch();

    expect(search).not.toHaveBeenCalled();
    expect(result.current.state).toBe('failed');
    expect(result.current.errorMessage).toBe('season store is corrupt');
  });

  it('searches again when a settled query is typed again, showing loading until it lands', async () => {
    const settles: ((result: SeasonProviderSearchResult) => void)[] = [];
    const search = vi.fn().mockImplementation(() => new Promise((resolve) => { settles.push(resolve); }));
    const { result } = renderLookup(search);

    act(() => result.current.onQueryChange('Ao Ashi'));
    await settleSearch();
    await actAndFlush(() => settles[0](found('Ao Ashi')));
    act(() => result.current.onQueryChange('Ao Ashi '));
    await settleSearch();

    expect(search).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('loading');
    expect(result.current.hasPages).toBe(false);
  });

  it('does not search a query below the minimum length and drops a response it superseded', async () => {
    let settle!: (result: SeasonProviderSearchResult) => void;
    const search = vi.fn().mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    const { result } = renderLookup(search);

    act(() => result.current.onQueryChange('Ao Ashi'));
    await settleSearch();
    act(() => result.current.onQueryChange('Ao'));
    await settleSearch();
    await actAndFlush(() => settle(found('Ao Ashi')));

    expect(search).toHaveBeenCalledOnce();
    expect(result.current.state).toBe('idle');
    expect(result.current.pages).toStrictEqual([]);
  });

  it('keeps only the newest response when two searches settle out of order', async () => {
    const settles: ((result: SeasonProviderSearchResult) => void)[] = [];
    const search = vi.fn().mockImplementation(() => new Promise((resolve) => { settles.push(resolve); }));
    const { result } = renderLookup(search);

    act(() => result.current.onQueryChange('Bleach'));
    await settleSearch();
    act(() => result.current.onQueryChange('Ao Ashi'));
    await settleSearch();
    await actAndFlush(() => settles[1](found('Ao Ashi')));
    await actAndFlush(() => settles[0](found('Bleach')));

    expect(result.current.pages.map((view) => view.title)).toStrictEqual(['Ao Ashi']);
  });

  it('resolves the row to the selected page and closes on confirm', async () => {
    const { result, onResolve } = renderLookup();

    act(() => result.current.onOpenChange(true));
    await settleSearch();
    act(() => result.current.onConfirm());
    expect(onResolve).not.toHaveBeenCalled();
    expect(result.current.isConfirmDisabled).toBe(true);

    act(() => result.current.onSelectPage(AO_ASHI_URL));
    expect(result.current.isConfirmDisabled).toBe(false);
    expect(result.current.pages[0].isSelected).toBe(true);
    act(() => result.current.onConfirm());

    expect(onResolve).toHaveBeenCalledExactlyOnceWith(AO_ASHI_URL);
    expect(result.current.isOpen).toBe(false);
  });

  it('clears the selection when the query changes', async () => {
    const { result } = renderLookup();

    act(() => result.current.onOpenChange(true));
    await settleSearch();
    act(() => result.current.onSelectPage(AO_ASHI_URL));
    act(() => result.current.onQueryChange('Ao Ashi 2'));

    expect(result.current.isConfirmDisabled).toBe(true);
  });
});
