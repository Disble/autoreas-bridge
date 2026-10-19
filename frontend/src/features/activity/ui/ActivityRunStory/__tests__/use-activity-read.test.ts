import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
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

describe('useActivityRead', () => {
  it('reads nothing without an id', () => {
    const reader = vi.fn(() => Promise.resolve<ActivityRead<string>>({ status: 'gone' }));
    const { result } = renderHook(() => useActivityRead<string, string>(SOURCE, undefined, reader));

    expect(result.current.read).toBeUndefined();
    expect(reader).not.toHaveBeenCalled();
  });

  it('reads once per id, loading until its answer arrives', async () => {
    const reader = vi.fn((_source: ActivitySource, id: string) => Promise.resolve<ActivityRead<string>>({ status: 'ready', value: `v-${id}` }));
    const { result } = renderHook(() => useActivityRead(SOURCE, 'a', reader));

    expect(result.current.read).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.read).toEqual({ status: 'ready', value: 'v-a' }));
    expect(reader).toHaveBeenCalledExactlyOnceWith(SOURCE, 'a');
  });

  it('reads again on retry, loading meanwhile', async () => {
    const first = pending();
    const second = pending();
    const reader = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useActivityRead<string, string>(SOURCE, 'a', reader));
    await act(async () => first.resolve('one'));
    expect(result.current.read).toEqual({ status: 'ready', value: 'one' });

    act(() => result.current.retry());
    expect(result.current.read).toEqual({ status: 'loading' });
    await act(async () => second.resolve('two'));
    expect(result.current.read).toEqual({ status: 'ready', value: 'two' });
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it('drops the answer for an id no longer read', async () => {
    const stale = pending();
    const current = pending();
    const reader = vi.fn((_source: ActivitySource, id: string) => (id === 'a' ? stale.promise : current.promise));
    const { result, rerender } = renderHook(({ id }) => useActivityRead(SOURCE, id, reader), { initialProps: { id: 'a' } });

    rerender({ id: 'b' });
    await act(async () => stale.resolve('old'));
    expect(result.current.read).toEqual({ status: 'loading' });
    await act(async () => current.resolve('new'));
    expect(result.current.read).toEqual({ status: 'ready', value: 'new' });
  });
});
