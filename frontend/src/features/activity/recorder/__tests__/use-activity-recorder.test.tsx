import { act, renderHook, waitFor } from '@testing-library/react';
import type { UIEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityRecorderEntry } from '../../activity-source/activity.types';
import type { ActivityRecorderPage } from '../../history-source/history.types';
import type { HistorySource } from '../../history-source/history-source.types';
import { useActivityRecorder } from '../use-activity-recorder';

/** A recorder row with only the fields a case names. */
function entry(overrides: Partial<ActivityRecorderEntry>): ActivityRecorderEntry {
  return {
    source: 'request',
    id: '',
    atMs: 0,
    kind: 'http',
    route: '/api/animes',
    httpStatus: undefined,
    outcome: 'ok',
    durationMs: undefined,
    deviceName: '',
    errorCode: '',
    domain: '',
    level: '',
    eventType: '',
    message: '',
    correlationId: '',
    ...overrides,
  };
}

/** A page of `count` requests whose ids start at `from`. */
function page(from: number, count: number, nextCursor: string): ActivityRecorderPage {
  return { entries: Array.from({ length: count }, (_unused, index) => entry({ id: `r-${from + index}` })), nextCursor };
}

/** A fake source whose live listener the test drives by hand. */
function fakeSource(listRecorder: HistorySource['listRecorder']) {
  const listeners: ((row: ActivityRecorderEntry) => void)[] = [];
  const unsubscribe = vi.fn();
  const source: HistorySource = {
    searchHistory: vi.fn(),
    listRecorder,
    subscribeRecorder: (listener) => {
      listeners.push(listener);
      return unsubscribe;
    },
  };
  return { source, unsubscribe, push: (row: ActivityRecorderEntry) => listeners.forEach((listener) => listener(row)) };
}

/** A scroll event of a container scrolled to its bottom. */
function bottomScroll(): UIEvent<HTMLDivElement> {
  const currentTarget = { scrollTop: 1000, clientHeight: 400, scrollHeight: 1400 };
  return { currentTarget } as unknown as UIEvent<HTMLDivElement>;
}

describe('useActivityRecorder', () => {
  it('starts loading, then renders the first page as one batch', async () => {
    const listRecorder = vi.fn(() => Promise.resolve(page(0, 50, 'c-1')));
    const { source } = fakeSource(listRecorder);
    const { result } = renderHook(() => useActivityRecorder(source));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(listRecorder).toHaveBeenCalledWith('', 50);
    expect(result.current.lines).toHaveLength(50);
    expect(result.current.isAtCap).toBe(false);
  });

  it('reads the older page near the bottom through the cursor and appends it without duplicates', async () => {
    const listRecorder = vi
      .fn<HistorySource['listRecorder']>()
      .mockResolvedValueOnce(page(0, 50, 'c-1'))
      .mockResolvedValueOnce(page(49, 50, ''));
    const { source } = fakeSource(listRecorder);
    const { result } = renderHook(() => useActivityRecorder(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.onScroll(bottomScroll()));
    await waitFor(() => expect(result.current.lines).toHaveLength(99));

    expect(listRecorder).toHaveBeenLastCalledWith('c-1', 50);
    expect(new Set(result.current.lines.map((line) => line.key)).size).toBe(99);
    act(() => result.current.onScroll(bottomScroll()));
    expect(listRecorder).toHaveBeenCalledTimes(2);
  });

  it('grows the window by one batch per older page, not to every held row', async () => {
    const listRecorder = vi
      .fn<HistorySource['listRecorder']>()
      .mockResolvedValueOnce(page(0, 50, 'c-1'))
      .mockResolvedValueOnce(page(50, 50, 'c-2'));
    const { source, push } = fakeSource(listRecorder);
    const { result } = renderHook(() => useActivityRecorder(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.onScroll(bottomScroll()));
    await waitFor(() => expect(result.current.rowCount).toBe(100));
    act(() => {
      for (let index = 0; index < 30; index += 1) {
        push(entry({ id: `live-${index}` }));
      }
    });

    expect(result.current.rowCount).toBe(130);
    expect(result.current.lines).toHaveLength(100);
  });

  it('flags an older page in flight, ignores scrolls meanwhile, and ignores a scroll far from the bottom', async () => {
    const listRecorder = vi
      .fn<HistorySource['listRecorder']>()
      .mockResolvedValueOnce(page(0, 50, 'c-1'))
      .mockReturnValueOnce(new Promise(() => undefined));
    const { source } = fakeSource(listRecorder);
    const { result } = renderHook(() => useActivityRecorder(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isLoadingMore).toBe(false);

    act(() => result.current.onScroll({ currentTarget: { scrollTop: 0, clientHeight: 400, scrollHeight: 1400 } } as unknown as UIEvent<HTMLDivElement>));
    expect(listRecorder).toHaveBeenCalledTimes(1);
    act(() => result.current.onScroll(bottomScroll()));
    act(() => result.current.onScroll(bottomScroll()));

    expect(listRecorder).toHaveBeenCalledTimes(2);
    expect(result.current.isLoadingMore).toBe(true);
  });

  it('prepends live rows and upserts a request emitted twice into one row, terminal state winning', async () => {
    const { source, push } = fakeSource(() => Promise.resolve(page(0, 2, '')));
    const { result } = renderHook(() => useActivityRecorder(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => push(entry({ id: 'live-1', outcome: 'pending' })));
    act(() => push(entry({ id: 'live-1', outcome: 'ok', httpStatus: 503 })));
    act(() => push(entry({ source: 'event', message: 'Run started', level: 'info' })));

    expect(result.current.lines.map((line) => line.key)).toEqual(['event:live:2', 'request:live-1', 'request:r-0', 'request:r-1']);
    expect(result.current.lines[1].statusLabel).toBe('503');
  });

  it('holds at most 500 rows after 10,000 pushes and stops paging at the cap', async () => {
    const listRecorder = vi.fn(() => Promise.resolve(page(0, 50, 'c-1')));
    const { source, push } = fakeSource(listRecorder);
    const { result } = renderHook(() => useActivityRecorder(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      for (let index = 0; index < 10_000; index += 1) {
        push(entry({ id: `live-${index}` }));
      }
    });
    for (let grow = 0; grow < 12; grow += 1) {
      act(() => result.current.onScroll(bottomScroll()));
    }

    expect(result.current.rowCount).toBe(500);
    expect(result.current.lines).toHaveLength(500);
    expect(result.current.isAtCap).toBe(true);
    expect(listRecorder).toHaveBeenCalledTimes(1);
  });

  it('keeps live rows that arrived before the first page resolved', async () => {
    let resolvePage: (value: ActivityRecorderPage) => void = () => undefined;
    const { source, push } = fakeSource(() => new Promise((resolve) => (resolvePage = resolve)));
    const { result } = renderHook(() => useActivityRecorder(source));

    act(() => push(entry({ id: 'early' })));
    await act(async () => resolvePage(page(0, 1, '')));

    expect(result.current.lines.map((line) => line.key)).toEqual(['request:early', 'request:r-0']);
  });

  it('fails, and retries into the resolved list', async () => {
    const listRecorder = vi.fn<HistorySource['listRecorder']>().mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce(page(0, 1, ''));
    const { source } = fakeSource(listRecorder);
    const { result } = renderHook(() => useActivityRecorder(source));
    await waitFor(() => expect(result.current.status).toBe('failed'));

    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.lines).toHaveLength(1);
  });

  it('keeps the rows on screen when an older page fails, and lets the next scroll try again', async () => {
    const listRecorder = vi
      .fn<HistorySource['listRecorder']>()
      .mockResolvedValueOnce(page(0, 50, 'c-1'))
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce(page(50, 1, ''));
    const { source } = fakeSource(listRecorder);
    const { result } = renderHook(() => useActivityRecorder(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.onScroll(bottomScroll()));
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    expect(result.current.status).toBe('ready');
    act(() => result.current.onScroll(bottomScroll()));
    await waitFor(() => expect(result.current.lines).toHaveLength(51));
  });

  it('unsubscribes on unmount', async () => {
    const { source, unsubscribe } = fakeSource(() => Promise.resolve(page(0, 1, '')));
    const { result, unmount } = renderHook(() => useActivityRecorder(source));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
