import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityFeedSource } from '../../feed-source/feed-source.types';
import type { ActivityFeedType, ActivityOverview } from '../../feed-source/feed.types';
import { useActivityOverview } from '../use-activity-overview';
import { buildOverview } from './activity-feed.fixtures';

/** An overview with one change line. */
const OVERVIEW = buildOverview([{ type: 'change', lines: 1, failed: 0 }]);

/** The sections the other reads select. */
const SECTIONS: readonly ActivityFeedType[] = ['change', 'download'];

/** A fake source whose overview reads resolve or reject in call order. */
function fakeSource(...replies: readonly (ActivityOverview | Error)[]): ActivityFeedSource {
  const getOverview = vi.fn<ActivityFeedSource['getOverview']>();
  for (const reply of replies) {
    getOverview.mockImplementationOnce(() => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)));
  }
  return { searchFeed: vi.fn(), getOverview, getEvent: vi.fn(), getChangeContext: vi.fn() };
}

describe('useActivityOverview', () => {
  it('reads the overview of the scale, range, origin, sections and failures-only, and again when a section or the failure switch changes', async () => {
    const source = fakeSource(OVERVIEW, OVERVIEW, OVERVIEW);
    const { result, rerender } = renderHook(({ types, failuresOnly }) => useActivityOverview(source, '7d', 10, 20, 'phone', types, failuresOnly), {
      initialProps: { types: ['change'] as readonly ActivityFeedType[], failuresOnly: false },
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.overview).toBe(OVERVIEW);
    expect(source.getOverview).toHaveBeenCalledWith('7d', 10, 20, 'phone', ['change'], false);

    rerender({ types: ['change', 'traffic'], failuresOnly: false });
    await waitFor(() => expect(source.getOverview).toHaveBeenLastCalledWith('7d', 10, 20, 'phone', ['change', 'traffic'], false));
    rerender({ types: ['change', 'traffic'], failuresOnly: true });
    await waitFor(() => expect(source.getOverview).toHaveBeenLastCalledWith('7d', 10, 20, 'phone', ['change', 'traffic'], true));
    expect(source.getOverview).toHaveBeenCalledTimes(3);
  });

  it('fails a first read, and reads again on retry', async () => {
    const source = fakeSource(new Error('down'), OVERVIEW);
    const { result } = renderHook(() => useActivityOverview(source, '24h', 0, 0, 'all', SECTIONS, false));
    await waitFor(() => expect(result.current.status).toBe('failed'));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.overview).toBe(OVERVIEW);
  });

  it('keeps the counts on screen when a refresh fails', async () => {
    const source = fakeSource(OVERVIEW, new Error('down'));
    const { result } = renderHook(() => useActivityOverview(source, '24h', 0, 0, 'all', SECTIONS, false));
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
    const { result, rerender } = renderHook(({ origin }) => useActivityOverview(source, '24h', 0, 0, origin, SECTIONS, false), { initialProps: { origin: 'all' as 'all' | 'phone' } });
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
    const { result, rerender } = renderHook(({ origin }) => useActivityOverview(source, '24h', 0, 0, origin, SECTIONS, false), {
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
