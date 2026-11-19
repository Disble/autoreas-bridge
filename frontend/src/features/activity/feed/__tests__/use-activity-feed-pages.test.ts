import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityFeedSource } from '../../../../shared/contracts/activity.types';
import type { ActivityFeedQuery, ActivityFeedView } from '../../../../shared/contracts/activity-feed.types';
import { useActivityFeedPages } from '../use-activity-feed-pages';
import { activityKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { createModulesTestWrapper } from '../../../../shared/query/test-support/bridge-modules.test-support';
import { NOW_MS, buildDay, buildLine, buildView } from './activity-feed.fixtures';

/** The query every case reads. */
const QUERY: ActivityFeedQuery = { fromMs: 0, toMs: 0, origin: 'all', types: ['change'], failuresOnly: false, cursor: '', limit: 40 };

/** The phone-origin query a case switches to. */
const PHONE: ActivityFeedQuery = { ...QUERY, origin: 'phone' };

/**
 * A page of lines on today, each with its id and time, with a cursor when more remain.
 * @param lines The `[id, atMs]` of each line, newest first.
 * @param nextCursor The cursor after them.
 * @returns The page.
 */
function pageAt(lines: readonly (readonly [string, number])[], nextCursor = ''): ActivityFeedView {
  return buildView([buildDay(0, lines.map(([id, atMs]) => buildLine({}, { id, atMs })))], nextCursor);
}

/**
 * A feed port over one `searchFeed` mock.
 * @param searchFeed The feed read.
 * @returns The port.
 */
function feedSourceWith(searchFeed: ActivityFeedSource['searchFeed']): ActivityFeedSource {
  return { searchFeed, getOverview: vi.fn(), getEvent: vi.fn(), getChangeContext: vi.fn(), getPhoneReport: vi.fn() };
}

/**
 * A fresh query client whose observability module is ready.
 * @returns Its wrapper.
 */
function observabilityReady() {
  return createModulesTestWrapper({ module: 'observability', state: 'ready' }).wrapper;
}

/**
 * A `searchFeed` that answers each query's first page at once and leaves the
 * older pages pending until the test settles them.
 * @returns The mock and the settle function of each pending older page, by cursor.
 */
function pagedFeed() {
  const older = new Map<string, (view: ActivityFeedView) => void>();
  const searchFeed = vi.fn<ActivityFeedSource['searchFeed']>((query) => {
    if (query.cursor !== '') {
      return new Promise((resolve) => older.set(query.cursor, resolve));
    }
    return Promise.resolve(query.origin === 'phone' ? pageAt([['p', NOW_MS]], 'pc') : pageAt([['2', NOW_MS]], 'c1'));
  });
  return { searchFeed, settle: (cursor: string, view: ActivityFeedView) => older.get(cursor)?.(view) };
}

/** A one-line page with the given line id and cursor. */
function onePage(id: string, nextCursor = ''): ActivityFeedView {
  return buildView([buildDay(0, [buildLine({}, { id })])], nextCursor);
}

/** A fake source whose reads resolve or reject in call order. */
function fakeSource(...replies: readonly (ActivityFeedView | Error)[]): ActivityFeedSource & { readonly searchFeed: ReturnType<typeof vi.fn> } {
  const searchFeed = vi.fn<ActivityFeedSource['searchFeed']>();
  for (const reply of replies) {
    searchFeed.mockImplementationOnce(() => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)));
  }
  return { searchFeed, getOverview: vi.fn(), getEvent: vi.fn(), getChangeContext: vi.fn(), getPhoneReport: vi.fn() };
}

/** Scrolls the page, which jsdom reports as already at its bottom. */
function scrollPage() {
  window.dispatchEvent(new Event('scroll'));
}

/** The loaded line ids, newest first. */
function ids(days: readonly { readonly lines: readonly { readonly line: { readonly id: string } }[] }[]) {
  return days.flatMap((day) => day.lines.map((line) => line.line.id));
}

describe('useActivityFeedPages', () => {
  it('reads nothing and resolves empty without a query, live refresh included', async () => {
    const source = fakeSource();
    const { client, wrapper } = createModulesTestWrapper({ module: 'observability', state: 'ready' });
    const { result } = renderHook(() => useActivityFeedPages(source, undefined), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.refreshLive());
    await act(() => new Promise((settle) => setTimeout(settle, 20)));

    expect(result.current.days).toEqual([]);
    expect(result.current.isLoadingMore).toBe(false);
    expect(source.searchFeed).not.toHaveBeenCalled();
    // Not even the disabled query ran.
    expect(client.getQueryCache().findAll({ queryKey: activityKeys.all }).map((query) => query.state.dataUpdateCount)).toEqual([0]);
  });

  it('keeps the loaded rows when an older page or a live refresh fails', async () => {
    const source = fakeSource(onePage('2', 'c1'), new Error('older'), new Error('live'));
    const { result } = renderHook(() => useActivityFeedPages(source, QUERY), { wrapper: createModulesTestWrapper({ module: 'observability', state: 'ready' }).wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => scrollPage());
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    act(() => result.current.refreshLive());
    await waitFor(() => expect(source.searchFeed).toHaveBeenCalledTimes(3));

    expect(ids(result.current.days)).toEqual(['2']);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.status).toBe('ready');
  });

  it('reads an older page only near the bottom, one at a time, while one remains and the hook is mounted', async () => {
    const source = fakeSource(onePage('2', 'c1'), onePage('1'));
    const { result, unmount } = renderHook(() => useActivityFeedPages(source, QUERY), { wrapper: createModulesTestWrapper({ module: 'observability', state: 'ready' }).wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 10_000 });

    act(() => scrollPage());

    expect(source.searchFeed).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(document.documentElement, 'scrollHeight');

    act(() => {
      scrollPage();
      scrollPage();
    });
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    act(() => scrollPage());

    expect(source.searchFeed).toHaveBeenCalledTimes(2);
    expect(ids(result.current.days)).toEqual(['2', '1']);

    unmount();
    scrollPage();
    expect(source.searchFeed).toHaveBeenCalledTimes(2);
  });

  it('drops a page or a failure that resolves after the query changed', async () => {
    let resolveOld: (view: ActivityFeedView) => void = () => undefined;
    let rejectOld: (error: Error) => void = () => undefined;
    const searchFeed = vi
      .fn<ActivityFeedSource['searchFeed']>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectOld = reject)))
      .mockResolvedValueOnce(onePage('new'));
    const source = { searchFeed, getOverview: vi.fn(), getEvent: vi.fn(), getChangeContext: vi.fn(), getPhoneReport: vi.fn() };
    const { result, rerender } = renderHook(({ query }) => useActivityFeedPages(source, query), { wrapper: createModulesTestWrapper({ module: 'observability', state: 'ready' }).wrapper, initialProps: { query: QUERY } });

    // Each read starts once the module gate lets it through.
    await waitFor(() => expect(searchFeed).toHaveBeenCalledOnce());
    rerender({ query: { ...QUERY, origin: 'phone' } });
    await waitFor(() => expect(searchFeed).toHaveBeenCalledTimes(2));
    rerender({ query: { ...QUERY, origin: 'bridge' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      resolveOld(onePage('old'));
      rejectOld(new Error('old'));
      await Promise.resolve();
    });

    expect(ids(result.current.days)).toEqual(['new']);
    expect(result.current.status).toBe('ready');
  });

  it('stays loading without reading while the observability module starts, and reads once it is ready', async () => {
    const source = fakeSource(onePage('2'));
    const { wrapper, emit } = createModulesTestWrapper({ module: 'observability', state: 'starting' });
    const { result } = renderHook(() => useActivityFeedPages(source, QUERY), { wrapper });

    await act(() => Promise.resolve());
    expect([result.current.status, result.current.days]).toEqual(['loading', []]);
    expect(source.searchFeed).not.toHaveBeenCalled();

    act(() => emit({ module: 'observability', state: 'ready' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(ids(result.current.days)).toEqual(['2']);
  });

  it('fails without reading when the observability module failed, and shows no rows', async () => {
    const source = fakeSource(onePage('2'));
    const { result } = renderHook(() => useActivityFeedPages(source, QUERY), {
      wrapper: createModulesTestWrapper({ module: 'observability', state: 'failed', reason: 'db closed' }).wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.days).toEqual([]);
    expect(source.searchFeed).not.toHaveBeenCalled();
  });

  it('shows loading until a new query answers, then its rows', async () => {
    let resolveNew: (view: ActivityFeedView) => void = () => undefined;
    const searchFeed = vi
      .fn<ActivityFeedSource['searchFeed']>()
      .mockResolvedValueOnce(onePage('old'))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveNew = resolve)));
    const source = { searchFeed, getOverview: vi.fn(), getEvent: vi.fn(), getChangeContext: vi.fn(), getPhoneReport: vi.fn() };
    const { result, rerender } = renderHook(({ query }) => useActivityFeedPages(source, query), {
      wrapper: createModulesTestWrapper({ module: 'observability', state: 'ready' }).wrapper,
      initialProps: { query: QUERY },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ query: { ...QUERY, origin: 'phone' } });
    await waitFor(() => expect(searchFeed).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('loading');

    await act(async () => resolveNew(onePage('new')));
    await waitFor(() => expect(ids(result.current.days)).toEqual(['new']));
  });

  it('loads more only while an older page is pending, and drops that window on a query change or unmount', async () => {
    const { searchFeed, settle } = pagedFeed();
    const { result, rerender } = renderHook(({ query }: { readonly query: ActivityFeedQuery | undefined }) => useActivityFeedPages(feedSourceWith(searchFeed), query), {
      wrapper: observabilityReady(),
      initialProps: { query: QUERY as ActivityFeedQuery | undefined },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isLoadingMore).toBe(false);

    act(() => scrollPage());
    await waitFor(() => expect(result.current.isLoadingMore).toBe(true));
    await act(async () => settle('c1', pageAt([['1', NOW_MS - 10]])));

    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    expect(ids(result.current.days)).toEqual(['2', '1']);

    rerender({ query: PHONE });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(ids(result.current.days)).toEqual(['p']);

    rerender({ query: undefined });

    expect([result.current.status, result.current.days, result.current.hasMore]).toEqual(['ready', [], false]);
  });

  it('stops loading more when the query changes, and keeps the new query loading more when an older page of the previous one settles', async () => {
    const { searchFeed, settle } = pagedFeed();
    const { result, rerender } = renderHook(({ query }) => useActivityFeedPages(feedSourceWith(searchFeed), query), {
      wrapper: observabilityReady(),
      initialProps: { query: QUERY },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => scrollPage());
    await waitFor(() => expect(result.current.isLoadingMore).toBe(true));

    rerender({ query: PHONE });
    expect(result.current.isLoadingMore).toBe(false);
    await waitFor(() => expect(ids(result.current.days)).toEqual(['p']));
    act(() => scrollPage());
    await waitFor(() => expect(result.current.isLoadingMore).toBe(true));
    await act(async () => settle('c1', pageAt([['1', NOW_MS - 10]])));

    expect(result.current.isLoadingMore).toBe(true);
    expect(ids(result.current.days)).toEqual(['p']);
  });

  it('never shows an older page read under a previous query, even after returning to that query', async () => {
    const { searchFeed, settle } = pagedFeed();
    const { result, rerender } = renderHook(({ query }) => useActivityFeedPages(feedSourceWith(searchFeed), query), {
      wrapper: observabilityReady(),
      initialProps: { query: QUERY },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => scrollPage());
    await waitFor(() => expect(result.current.isLoadingMore).toBe(true));

    rerender({ query: PHONE });
    await waitFor(() => expect(ids(result.current.days)).toEqual(['p']));
    await act(async () => settle('c1', pageAt([['1', NOW_MS - 10]])));
    expect(ids(result.current.days)).toEqual(['p']);

    rerender({ query: QUERY });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(ids(result.current.days)).toEqual(['2']);
  });
});
