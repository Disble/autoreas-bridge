import { act, renderHook, waitFor } from '@testing-library/react';
import type { UIEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityFeedSource } from '../../feed-source/feed-source.types';
import type { ActivityFeedQuery, ActivityFeedView } from '../../feed-source/feed.types';
import { useActivityFeedPages } from '../use-activity-feed-pages';
import { buildDay, buildLine, buildView } from './activity-feed.fixtures';

/** The query every case reads. */
const QUERY: ActivityFeedQuery = { fromMs: 0, toMs: 0, origin: 'all', types: ['change'], failuresOnly: false, cursor: '', limit: 40 };

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
  return { searchFeed, getOverview: vi.fn(), getEvent: vi.fn() };
}

/** A scroll event of a list already at its bottom. */
const BOTTOM_SCROLL = { currentTarget: { scrollTop: 0, clientHeight: 100, scrollHeight: 100 } } as unknown as UIEvent<HTMLDivElement>;

/** The loaded line ids, newest first. */
function ids(days: readonly { readonly lines: readonly { readonly line: { readonly id: string } }[] }[]) {
  return days.flatMap((day) => day.lines.map((line) => line.line.id));
}

describe('useActivityFeedPages', () => {
  it('reads nothing and resolves empty without a query, live refresh included', async () => {
    const source = fakeSource();
    const { result } = renderHook(() => useActivityFeedPages(source, undefined));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.refreshLive());

    expect(result.current.days).toEqual([]);
    expect(source.searchFeed).not.toHaveBeenCalled();
  });

  it('keeps the loaded rows when an older page or a live refresh fails', async () => {
    const source = fakeSource(onePage('2', 'c1'), new Error('older'), new Error('live'));
    const { result } = renderHook(() => useActivityFeedPages(source, QUERY));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.onScroll(BOTTOM_SCROLL));
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    act(() => result.current.refreshLive());
    await waitFor(() => expect(source.searchFeed).toHaveBeenCalledTimes(3));

    expect(ids(result.current.days)).toEqual(['2']);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.status).toBe('ready');
  });

  it('does not read an older page while one is loading or when none remains', async () => {
    const source = fakeSource(onePage('2', 'c1'), onePage('1'));
    const { result } = renderHook(() => useActivityFeedPages(source, QUERY));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.onScroll(BOTTOM_SCROLL);
      result.current.onScroll(BOTTOM_SCROLL);
    });
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    act(() => result.current.onScroll(BOTTOM_SCROLL));

    expect(source.searchFeed).toHaveBeenCalledTimes(2);
    expect(ids(result.current.days)).toEqual(['2', '1']);
  });

  it('drops a page or a failure that resolves after the query changed', async () => {
    let resolveOld: (view: ActivityFeedView) => void = () => undefined;
    let rejectOld: (error: Error) => void = () => undefined;
    const searchFeed = vi
      .fn<ActivityFeedSource['searchFeed']>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectOld = reject)))
      .mockResolvedValueOnce(onePage('new'));
    const source = { searchFeed, getOverview: vi.fn(), getEvent: vi.fn() };
    const { result, rerender } = renderHook(({ query }) => useActivityFeedPages(source, query), { initialProps: { query: QUERY } });

    rerender({ query: { ...QUERY, origin: 'phone' } });
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
});
