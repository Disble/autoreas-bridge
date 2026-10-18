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

/** A story with an info step, a warning carrying metadata, and a final step. */
const STORY: ActivityRunStory = {
  correlationId: 'c-1',
  truncated: false,
  steps: [step({ id: 1, metadataJson: '{"episode":11}' }), step({ id: 2, level: 'warn', metadataJson: '{"hoster":"mega"}' }), step({ id: 3, metadataJson: '' })],
};

/** A source whose only used read is the run story. */
function sourceWith(getRunStory: ActivitySource['getRunStory']): ActivitySource {
  return { getRunStory } as unknown as ActivitySource;
}

describe('useActivityRunStory', () => {
  it('reads the story once and opens on the first warning with its recorded detail', async () => {
    const getRunStory = vi.fn(() => Promise.resolve(STORY));
    const source = sourceWith(getRunStory);
    const { result } = renderHook(() => useActivityRunStory('c-1', source));

    expect(result.current.read.status).toBe('loading');
    expect(result.current.metadata).toEqual({ fields: [], raw: '' });
    expect(result.current.isRawOpen).toBe(false);
    act(() => result.current.copyReference());
    await waitFor(() => expect(result.current.read.status).toBe('ready'));

    expect(getRunStory).toHaveBeenCalledExactlyOnceWith('c-1');
    expect(result.current.selectedStepId).toBe(2);
    expect(result.current.metadata.fields).toEqual([{ kind: 'value', label: 'hoster', value: 'mega' }]);
    expect(result.current.model?.steps.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('switches the recorded detail with the selected step and opens its raw metadata on demand', async () => {
    const source = sourceWith(() => Promise.resolve(STORY));
    const { result } = renderHook(() => useActivityRunStory('c-1', source));
    await waitFor(() => expect(result.current.read.status).toBe('ready'));

    act(() => result.current.selectStep(1));
    expect(result.current.metadata.fields).toEqual([{ kind: 'value', label: 'episode', value: '11' }]);
    expect(result.current.isRawOpen).toBe(false);

    act(() => result.current.toggleRaw());
    expect(result.current.isRawOpen).toBe(true);
    act(() => result.current.toggleRaw());
    expect(result.current.isRawOpen).toBe(false);

    act(() => result.current.toggleRaw());
    act(() => result.current.selectStep(3));
    expect(result.current.isRawOpen).toBe(false);
    expect(result.current.metadata).toEqual({ fields: [], raw: '' });
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
    act(() => result.current.selectStep(10));

    expect(result.current.model?.steps.map((item) => item.id)).toEqual([9, 10]);
    expect(result.current.selectedStepId).toBe(10);
    expect(getRunStory).toHaveBeenNthCalledWith(2, 'c-2');
  });
});
