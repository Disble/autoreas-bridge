import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivitySource } from '../../../../../shared/contracts/activity.types';
import type { ReadinessState } from '../../../../../shared/contracts/readiness.types';
import { activityKeys } from '../../../../../shared/query/query-keys/query-keys.constants';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import type { ActivityRead } from '../activity-run-story.types';
import { useActivityRead } from '../use-activity-read';

/** A port the readers below never touch. */
const SOURCE = {} as ActivitySource;

/** A pending read the test settles by hand. */
interface Pending {
  /** The read handed to the hook. */
  readonly promise: Promise<ActivityRead<string>>;
  /** Settles it ready with a value. */
  readonly resolve: (value: string) => void;
}

/** Creates a pending read. */
function pending(): Pending {
  let resolve: (value: string) => void = () => undefined;
  const promise = new Promise<ActivityRead<string>>((settle) => {
    resolve = (value) => settle({ status: 'ready', value });
  });
  return { promise, resolve };
}

/**
 * A query wrapper whose `observability` module is in one state.
 * @param state The module state.
 * @returns The wrapper and the readiness emitter.
 */
function observability(state: ReadinessState = 'ready') {
  return createModulesTestWrapper({ module: 'observability', state, reason: state === 'failed' ? 'db closed' : '' });
}

describe('useActivityRead', () => {
  it('reads nothing without an id, not even the query', async () => {
    const reader = vi.fn(() => Promise.resolve<ActivityRead<string>>({ status: 'gone' }));
    const { client, wrapper } = observability();
    const { result } = renderHook(() => useActivityRead<string, string>(SOURCE, undefined, reader, 'run-story'), { wrapper });

    await act(() => new Promise((settle) => setTimeout(settle, 20)));

    expect(result.current.read).toBeUndefined();
    expect(reader).not.toHaveBeenCalled();
    expect(client.getQueryCache().findAll({ queryKey: activityKeys.all }).map((query) => query.state.dataUpdateCount)).toEqual([0]);
  });

  it('reads once per id, loading until its answer arrives', async () => {
    const reader = vi.fn((_source: ActivitySource, id: string) => Promise.resolve<ActivityRead<string>>({ status: 'ready', value: `v-${id}` }));
    const { result } = renderHook(() => useActivityRead(SOURCE, 'a', reader, 'run-story'), { wrapper: observability().wrapper });

    expect(result.current.read).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.read).toEqual({ status: 'ready', value: 'v-a' }));
    expect(reader).toHaveBeenCalledExactlyOnceWith(SOURCE, 'a');
  });

  it('shows a lookup that found nothing as gone', async () => {
    const reader = vi.fn(() => Promise.resolve<ActivityRead<string>>({ status: 'gone' }));
    const { result } = renderHook(() => useActivityRead(SOURCE, 'a', reader, 'incident'), { wrapper: observability().wrapper });

    await waitFor(() => expect(result.current.read).toEqual({ status: 'gone' }));
  });

  it('stays loading while the observability module starts, and reads once it is ready', async () => {
    const reader = vi.fn(() => Promise.resolve<ActivityRead<string>>({ status: 'ready', value: 'v' }));
    const { wrapper, emit } = observability('starting');
    const { result } = renderHook(() => useActivityRead(SOURCE, 'a', reader, 'run-story'), { wrapper });

    await act(() => Promise.resolve());
    expect(result.current.read).toEqual({ status: 'loading' });
    expect(reader).not.toHaveBeenCalled();

    act(() => emit({ module: 'observability', state: 'ready', reason: '' }));
    await waitFor(() => expect(result.current.read).toEqual({ status: 'ready', value: 'v' }));
  });

  it('fails without reading when the observability module failed', async () => {
    const reader = vi.fn(() => Promise.resolve<ActivityRead<string>>({ status: 'ready', value: 'v' }));
    const { result } = renderHook(() => useActivityRead(SOURCE, 'a', reader, 'run-story'), { wrapper: observability('failed').wrapper });

    await waitFor(() => expect(result.current.read).toEqual({ status: 'failed' }));
    expect(reader).not.toHaveBeenCalled();
  });

  it('fails a read that rejects', async () => {
    const reader = vi.fn(() => Promise.reject(new Error('boom')));
    const { result } = renderHook(() => useActivityRead<string, string>(SOURCE, 'a', reader, 'run-story'), { wrapper: observability().wrapper });

    await waitFor(() => expect(result.current.read).toEqual({ status: 'failed' }));
  });

  it('reads again on retry, loading meanwhile', async () => {
    const first = pending();
    const second = pending();
    const reader = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useActivityRead<string, string>(SOURCE, 'a', reader, 'run-story'), { wrapper: observability().wrapper });
    await act(async () => first.resolve('one'));
    await waitFor(() => expect(result.current.read).toEqual({ status: 'ready', value: 'one' }));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.read).toEqual({ status: 'loading' }));
    await act(async () => second.resolve('two'));
    await waitFor(() => expect(result.current.read).toEqual({ status: 'ready', value: 'two' }));
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it('drops the answer for an id no longer read', async () => {
    const stale = pending();
    const current = pending();
    const reader = vi.fn((_source: ActivitySource, id: string) => (id === 'a' ? stale.promise : current.promise));
    const { result, rerender } = renderHook(({ id }) => useActivityRead(SOURCE, id, reader, 'run-story'), { initialProps: { id: 'a' }, wrapper: observability().wrapper });

    rerender({ id: 'b' });
    await act(async () => stale.resolve('old'));
    expect(result.current.read).toEqual({ status: 'loading' });
    await act(async () => current.resolve('new'));
    await waitFor(() => expect(result.current.read).toEqual({ status: 'ready', value: 'new' }));
  });

  it('keeps two reads of one id apart by what they read', async () => {
    const incident = vi.fn(() => Promise.resolve<ActivityRead<string>>({ status: 'ready', value: 'incident' }));
    const story = vi.fn(() => Promise.resolve<ActivityRead<string>>({ status: 'ready', value: 'story' }));
    const { wrapper } = observability();
    const { result } = renderHook(() => [useActivityRead(SOURCE, 'a', incident, 'incident'), useActivityRead(SOURCE, 'a', story, 'run-story')] as const, { wrapper });

    await waitFor(() => expect(result.current.map(({ read }) => read)).toEqual([{ status: 'ready', value: 'incident' }, { status: 'ready', value: 'story' }]));
  });
});
