import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityRunStep, ActivityRunStory } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { useActivityRunStory } from '../use-activity-run-story';

/** One run step with defaults. */
function step(overrides: Partial<ActivityRunStep>): ActivityRunStep {
  return {
    id: 1,
    atMs: 0,
    domain: 'download',
    level: 'info',
    eventType: 'download.started',
    message: 'Download started',
    correlationId: 'c-1',
    durationMs: undefined,
    metadataJson: '',
    ...overrides,
  };
}

/** A story with an info step, a warning, and a final step. */
const STORY: ActivityRunStory = {
  correlationId: 'c-1',
  truncated: false,
  steps: [step({ id: 1 }), step({ id: 2, level: 'warn' }), step({ id: 3 })],
};

/** A source whose only used read is the run story. */
function sourceWith(getRunStory: ActivitySource['getRunStory']): ActivitySource {
  return { getRunStory } as unknown as ActivitySource;
}

describe('useActivityRunStory', () => {
  it('reads the story once and words its steps', async () => {
    const getRunStory = vi.fn(() => Promise.resolve(STORY));
    const source = sourceWith(getRunStory);
    const { result } = renderHook(() => useActivityRunStory('c-1', source));

    expect(result.current.read.status).toBe('loading');
    expect(result.current.model).toBeUndefined();
    await waitFor(() => expect(result.current.read.status).toBe('ready'));

    expect(getRunStory).toHaveBeenCalledExactlyOnceWith('c-1');
    expect(result.current.model?.steps.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('shows the failure, then reads again on every retry', async () => {
    const getRunStory = vi.fn().mockRejectedValueOnce(new Error('locked')).mockRejectedValueOnce(new Error('locked')).mockResolvedValueOnce(STORY);
    const source = sourceWith(getRunStory);
    const { result } = renderHook(() => useActivityRunStory('c-1', source));
    await waitFor(() => expect(result.current.read.status).toBe('failed'));

    act(() => result.current.retry());
    expect(result.current.read.status).toBe('loading');
    await waitFor(() => expect(result.current.read.status).toBe('failed'));
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.read.status).toBe('ready'));
    expect(getRunStory).toHaveBeenCalledTimes(3);
  });

  it('ignores the answer of a run that is no longer shown', async () => {
    let resolveFirst: (story: ActivityRunStory) => void = () => undefined;
    const getRunStory = vi
      .fn()
      .mockImplementationOnce(() => new Promise<ActivityRunStory>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ ...STORY, correlationId: 'c-2', steps: [step({ id: 9, correlationId: 'c-2' }), step({ id: 10, correlationId: 'c-2' })] });
    const source = sourceWith(getRunStory);
    const { result, rerender } = renderHook(({ id }) => useActivityRunStory(id, source), { initialProps: { id: 'c-1' } });

    rerender({ id: 'c-2' });
    await waitFor(() => expect(result.current.read.status).toBe('ready'));
    await act(async () => resolveFirst(STORY));

    expect(result.current.model?.steps.map((item) => item.id)).toEqual([9, 10]);
    expect(getRunStory).toHaveBeenNthCalledWith(2, 'c-2');
  });
});
