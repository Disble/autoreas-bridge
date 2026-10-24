import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityFeedSource } from '../../feed-source/feed-source.types';
import type { ActivityOverview } from '../../feed-source/feed.types';
import { useActivityOverview } from '../use-activity-overview';
import { buildOverview } from './activity-feed.fixtures';

/** An overview with one change line. */
const OVERVIEW = buildOverview([{ type: 'change', lines: 1, failed: 0 }]);

/** A fake source whose overview reads resolve or reject in call order. */
function fakeSource(...replies: readonly (ActivityOverview | Error)[]): ActivityFeedSource {
  const getOverview = vi.fn<ActivityFeedSource['getOverview']>();
  for (const reply of replies) {
    getOverview.mockImplementationOnce(() => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)));
  }
  return { searchFeed: vi.fn(), getOverview, getEvent: vi.fn(), getChangeContext: vi.fn() };
}

describe('useActivityOverview', () => {
  it('reads the overview of the scale, range and origin', async () => {
    const source = fakeSource(OVERVIEW);
    const { result } = renderHook(() => useActivityOverview(source, '7d', 10, 20, 'phone'));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.overview).toBe(OVERVIEW);
    expect(source.getOverview).toHaveBeenCalledWith('7d', 10, 20, 'phone');
  });

  it('fails a first read, and reads again on retry', async () => {
    const source = fakeSource(new Error('down'), OVERVIEW);
    const { result } = renderHook(() => useActivityOverview(source, '24h', 0, 0, 'all'));
    await waitFor(() => expect(result.current.status).toBe('failed'));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.overview).toBe(OVERVIEW);
  });

  it('keeps the counts on screen when a refresh fails', async () => {
    const source = fakeSource(OVERVIEW, new Error('down'));
    const { result } = renderHook(() => useActivityOverview(source, '24h', 0, 0, 'all'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.refresh());
    await waitFor(() => expect(source.getOverview).toHaveBeenCalledTimes(2));
    await act(() => Promise.resolve());

    expect(result.current.status).toBe('ready');
    expect(result.current.overview).toBe(OVERVIEW);
  });

  it('keeps the drawn overview while a new origin is read', async () => {
    const source = fakeSource(OVERVIEW);
    vi.mocked(source.getOverview).mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = renderHook(({ origin }) => useActivityOverview(source, '24h', 0, 0, origin), { initialProps: { origin: 'all' as 'all' | 'phone' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ origin: 'phone' });

    expect([result.current.status, result.current.overview]).toEqual(['ready', OVERVIEW]);
  });

  it('drops a read that resolves after the origin changed', async () => {
    let resolveOld: (view: ActivityOverview) => void = () => undefined;
    const fresh = buildOverview([]);
    const getOverview = vi
      .fn<ActivityFeedSource['getOverview']>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce(fresh);
    const source = { searchFeed: vi.fn(), getOverview, getEvent: vi.fn(), getChangeContext: vi.fn() };
    const { result, rerender } = renderHook(({ origin }) => useActivityOverview(source, '24h', 0, 0, origin), {
      initialProps: { origin: 'all' as 'all' | 'phone' },
    });

    rerender({ origin: 'phone' });
    await waitFor(() => expect(result.current.overview).toBe(fresh));
    await act(async () => {
      resolveOld(OVERVIEW);
      await Promise.resolve();
    });

    expect(result.current.overview).toBe(fresh);
  });
});
