import { act, renderHook, waitFor } from '@testing-library/react';
import type { UIEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityHistoryView, ActivityLedgerDay } from '../../history-source/history.types';
import type { HistorySource } from '../../history-source/history-source.types';
import { useActivityHistory } from '../use-activity-history';

/** Local midnight of 2026-10-`day`. */
function dayMs(day: number): number {
  return new Date(2026, 9, day).getTime();
}

/** A day group holding lines with the given ids. */
function group(day: number, ids: readonly string[]): ActivityLedgerDay {
  return {
    dayStartMs: dayMs(day),
    lines: ids.map((id) => ({
      kind: 'change',
      id,
      atMs: dayMs(day) + 1000,
      phoneAtMs: undefined,
      domain: 'anime',
      source: 'mobile',
      level: '',
      title: `Line ${id}`,
      detail: '',
      correlationId: '',
      marks: [],
    })),
  };
}

/** A History page; the calendar records Oct 12-18. */
function view(days: readonly ActivityLedgerDay[], nextCursor: string, withCalendar = true): ActivityHistoryView {
  const calendar = withCalendar ? Array.from({ length: 7 }, (_unused, index) => ({ dayStartMs: dayMs(12 + index), total: 3, hasData: true, hasIncident: false })) : [];
  return { calendar, days, nextCursor };
}

/** A fake source over the given History read. */
function fakeSource(searchHistory: HistorySource['searchHistory']): HistorySource {
  return { searchHistory, listRecorder: vi.fn(), subscribeRecorder: () => () => undefined };
}

/** A scroll event of a container scrolled to its bottom. */
function bottomScroll(): UIEvent<HTMLDivElement> {
  return { currentTarget: { scrollTop: 1000, clientHeight: 400, scrollHeight: 1400 } } as unknown as UIEvent<HTMLDivElement>;
}

describe('useActivityHistory', () => {
  it('reads the first page under All and resolves into the day list', async () => {
    const search = vi.fn(() => Promise.resolve(view([group(18, ['a'])], '')));
    const source = fakeSource(search);
    const { result } = renderHook(() => useActivityHistory(source));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(search).toHaveBeenCalledWith('all', '', 50);
    expect(result.current.resolvedView).toBe('days');
    expect(result.current.calendar.cells).toHaveLength(7);
    expect(result.current.items.map((item) => item.key)).toEqual([`day:${dayMs(18)}`]);
  });

  it('reads older days near the bottom through the cursor, joining a split day without duplicates', async () => {
    const search = vi
      .fn<HistorySource['searchHistory']>()
      .mockResolvedValueOnce(view([group(18, ['a']), group(17, ['b'])], 'c-1'))
      .mockResolvedValueOnce(view([group(17, ['b', 'c']), group(16, ['d'])], '', false));
    const source = fakeSource(search);
    const { result } = renderHook(() => useActivityHistory(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.onScroll(bottomScroll()));
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    expect(search).toHaveBeenLastCalledWith('all', 'c-1', 50);
    const lineKeys = result.current.items.flatMap((item) => (item.kind === 'day' ? item.lines.map((line) => line.key) : []));
    expect(lineKeys).toEqual(['change:a', 'change:b', 'change:c', 'change:d']);
    expect(result.current.calendar.cells).toHaveLength(7);
    act(() => result.current.onScroll(bottomScroll()));
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('ignores a scroll that is not near the bottom and a second scroll while a page is in flight', async () => {
    const search = vi
      .fn<HistorySource['searchHistory']>()
      .mockResolvedValueOnce(view([group(18, ['a'])], 'c-1'))
      .mockReturnValueOnce(new Promise(() => undefined));
    const source = fakeSource(search);
    const { result } = renderHook(() => useActivityHistory(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.onScroll({ currentTarget: { scrollTop: 0, clientHeight: 400, scrollHeight: 1400 } } as unknown as UIEvent<HTMLDivElement>));
    expect(search).toHaveBeenCalledTimes(1);
    act(() => result.current.onScroll(bottomScroll()));
    act(() => result.current.onScroll(bottomScroll()));

    expect(search).toHaveBeenCalledTimes(2);
    expect(result.current.isLoadingMore).toBe(true);
  });

  it('narrows to a filter by reading its first page again, and drops a stale older page', async () => {
    let resolveOlder: (value: ActivityHistoryView) => void = () => undefined;
    const search = vi
      .fn<HistorySource['searchHistory']>()
      .mockResolvedValueOnce(view([group(18, ['a'])], 'c-1'))
      .mockReturnValueOnce(new Promise((resolve) => (resolveOlder = resolve)))
      .mockResolvedValueOnce(view([group(15, ['dl'])], ''));
    const source = fakeSource(search);
    const { result } = renderHook(() => useActivityHistory(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.onScroll(bottomScroll()));
    act(() => result.current.onWhereChange(new Set(['downloads'])));
    await waitFor(() => expect(result.current.items.map((item) => item.key)).toEqual([`day:${dayMs(15)}`]));
    await act(async () => resolveOlder(view([group(10, ['stale'])], '')));

    expect(search).toHaveBeenLastCalledWith('downloads', '', 50);
    expect(result.current.where).toBe('downloads');
    expect(result.current.items.map((item) => item.key)).toEqual([`day:${dayMs(15)}`]);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it('drops a first page, or its failure, that resolves after the filter changed', async () => {
    let resolveStale: (value: ActivityHistoryView) => void = () => undefined;
    let rejectStale: (reason: Error) => void = () => undefined;
    const search = vi
      .fn<HistorySource['searchHistory']>()
      .mockReturnValueOnce(new Promise((resolve) => (resolveStale = resolve)))
      .mockReturnValueOnce(new Promise((_resolve, reject) => (rejectStale = reject)))
      .mockResolvedValueOnce(view([group(15, ['fresh'])], ''));
    const source = fakeSource(search);
    const { result } = renderHook(() => useActivityHistory(source));

    act(() => result.current.onWhereChange(new Set(['phone'])));
    act(() => result.current.onWhereChange(new Set(['season'])));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => resolveStale(view([group(10, ['stale'])], '')));
    await act(async () => rejectStale(new Error('db')));

    expect(result.current.status).toBe('ready');
    expect(result.current.items.map((item) => item.key)).toEqual([`day:${dayMs(15)}`]);
  });

  it('shows the gaps older than every day only once no older page remains', async () => {
    const calendar = [12, 13, 14].map((day) => ({ dayStartMs: dayMs(day), total: day === 13 ? 0 : 3, hasData: day !== 13, hasIncident: false }));
    const search = vi
      .fn<HistorySource['searchHistory']>()
      .mockResolvedValueOnce({ calendar, days: [group(14, ['a'])], nextCursor: 'c-1' })
      .mockResolvedValueOnce({ calendar: [], days: [], nextCursor: '' });
    const source = fakeSource(search);
    const { result } = renderHook(() => useActivityHistory(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items.map((item) => item.kind)).toEqual(['day']);

    act(() => result.current.onScroll(bottomScroll()));

    await waitFor(() => expect(result.current.items.map((item) => item.kind)).toEqual(['day', 'gap']));
  });

  it('ignores a selection of the filter already shown', async () => {
    const search = vi.fn(() => Promise.resolve(view([group(18, ['a'])], '')));
    const source = fakeSource(search);
    const { result } = renderHook(() => useActivityHistory(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.onWhereChange(new Set(['all'])));

    expect(search).toHaveBeenCalledTimes(1);
  });

  it('shows the filtered empty view and returns to All', async () => {
    const search = vi
      .fn<HistorySource['searchHistory']>()
      .mockResolvedValueOnce(view([group(18, ['a'])], ''))
      .mockResolvedValueOnce(view([], ''))
      .mockResolvedValueOnce(view([group(18, ['a'])], ''));
    const source = fakeSource(search);
    const { result } = renderHook(() => useActivityHistory(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.onWhereChange(new Set(['season'])));
    await waitFor(() => expect(result.current.resolvedView).toBe('filtered-empty'));
    act(() => result.current.showAll());
    await waitFor(() => expect(result.current.resolvedView).toBe('days'));

    expect(result.current.where).toBe('all');
    expect(search).toHaveBeenLastCalledWith('all', '', 50);
  });

  it('fails, and retries the same filter', async () => {
    const search = vi.fn<HistorySource['searchHistory']>().mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce(view([group(18, ['a'])], ''));
    const source = fakeSource(search);
    const { result } = renderHook(() => useActivityHistory(source));
    await waitFor(() => expect(result.current.status).toBe('failed'));

    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(search).toHaveBeenNthCalledWith(2, 'all', '', 50);
  });

  it('keeps the days on screen when an older page fails, and lets the next scroll try again', async () => {
    const search = vi
      .fn<HistorySource['searchHistory']>()
      .mockResolvedValueOnce(view([group(18, ['a'])], 'c-1'))
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce(view([group(17, ['b'])], '', false));
    const source = fakeSource(search);
    const { result } = renderHook(() => useActivityHistory(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.onScroll(bottomScroll()));
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    expect(result.current.status).toBe('ready');
    act(() => result.current.onScroll(bottomScroll()));

    await waitFor(() => expect(result.current.items).toHaveLength(2));
  });
});
