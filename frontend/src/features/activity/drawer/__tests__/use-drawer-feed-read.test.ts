import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityFeedSource } from '../../../../shared/contracts/activity.types';
import { activityKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { createModulesTestWrapper } from '../../../../shared/query/test-support/bridge-modules.test-support';
import type { ActivityRead } from '../../ui/ActivityRunStory/activity-run-story.types';
import { useDrawerFeedRead } from '../use-drawer-feed-read';

/** A feed port the readers below never touch. */
const FEED = {} as ActivityFeedSource;

/**
 * A fresh query client whose observability module is ready.
 * @returns The client and its wrapper.
 */
function observabilityReady() {
  return createModulesTestWrapper({ module: 'observability', state: 'ready' });
}

describe('useDrawerFeedRead', () => {
  it('reads nothing without an id, not even the query', async () => {
    const reader = vi.fn(() => Promise.resolve<ActivityRead<string>>({ status: 'gone' }));
    const { client, wrapper } = observabilityReady();
    const { result } = renderHook(() => useDrawerFeedRead<number, string>(FEED, undefined, reader, 'event'), { wrapper });

    await act(() => new Promise((settle) => setTimeout(settle, 20)));

    expect(result.current.read).toBeUndefined();
    expect(reader).not.toHaveBeenCalled();
    expect(client.getQueryCache().findAll({ queryKey: activityKeys.all }).map((query) => query.state.dataUpdateCount)).toEqual([0]);
  });

  it('reads the id once through the feed port, and again on retry', async () => {
    const reader = vi.fn((_source: ActivityFeedSource, id: number) => Promise.resolve<ActivityRead<string>>({ status: 'ready', value: `event-${id}` }));
    const { result } = renderHook(() => useDrawerFeedRead(FEED, 7, reader, 'event'), { wrapper: observabilityReady().wrapper });

    await waitFor(() => expect(result.current.read).toEqual({ status: 'ready', value: 'event-7' }));
    act(() => result.current.retry());

    await waitFor(() => expect(reader).toHaveBeenCalledTimes(2));
    expect(reader).toHaveBeenCalledWith(FEED, 7);
  });
});
