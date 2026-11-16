import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModuleReadiness } from '../../../../../../shared/contracts/readiness.types';
import type { SeasonProviderSearchResult } from '../../../../../../shared/contracts/season.types';
import { METADATA_LOOKUP_DEBOUNCE_MS } from '../../../../../../shared/metadata-lookup/metadata-lookup.constants';
import { createModulesTestWrapper } from '../../../../../../shared/query/test-support/bridge-modules.test-support';
import type { ProviderSearchPort } from '../intake-provider-lookup.types';
import { useIntakeProviderLookup } from '../use-intake-provider-lookup';

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
