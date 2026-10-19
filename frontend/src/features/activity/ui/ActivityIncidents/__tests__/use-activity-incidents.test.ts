import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityIncidentSummary } from '../../../activity-source/activity.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import type { ActivityIncidentOpenRequest } from '../activity-incidents.types';
import { useActivityIncidents } from '../use-activity-incidents';

/** One incident summary. */
function incident(latestId: number): ActivityIncidentSummary {
  return { latestId, fingerprint: 'fp', reason: 'r', title: `Incident ${latestId}`, latestAtMs: 0, firstSeenAtMs: 0, occurrences: 1, isNew: false, isError: true };
}

/** A source over the two list reads. */
function sourceWith(listIncidents: ActivitySource['listIncidents'], listRuns: ActivitySource['listRuns'] = vi.fn(() => Promise.resolve([]))): ActivitySource {
  return { listIncidents, listRuns } as unknown as ActivitySource;
}

describe('useActivityIncidents', () => {
  it('lists the incidents of All without reading runs', async () => {
    const listIncidents = vi.fn(() => Promise.resolve([incident(9), incident(4)]));
    const listRuns = vi.fn(() => Promise.resolve([]));
    const source = sourceWith(listIncidents, listRuns);
    const { result } = renderHook(() => useActivityIncidents(undefined, source));

    expect(result.current.list.status).toBe('loading');
    await waitFor(() => expect(result.current.list.status).toBe('ready'));

    expect(listIncidents).toHaveBeenCalledExactlyOnceWith('all');
    expect(listRuns).not.toHaveBeenCalled();
    expect(result.current.entries.map((entry) => entry.key)).toEqual(['incident:9', 'incident:4']);
    expect(result.current.selection).toBeUndefined();
  });

  it('narrows to a filter and reads its runs when the filter is internal bridge work', async () => {
    const listIncidents = vi.fn(() => Promise.resolve([incident(9)]));
    const listRuns = vi.fn(() => Promise.resolve([{ correlationId: 'c-1', firstAtMs: 0, lastAtMs: 0, steps: 1, outcome: 'info', firstEventType: 'e', firstMessage: 'm' }]));
    const source = sourceWith(listIncidents, listRuns);
    const { result } = renderHook(() => useActivityIncidents(undefined, source));
    await waitFor(() => expect(result.current.list.status).toBe('ready'));

    act(() => result.current.select({ kind: 'incident', id: 9 }));
    act(() => result.current.selectWhere(new Set(['downloads'])));
    // A new filter clears the detail pane: what was open may not belong to it.
    expect(result.current.selection).toBeUndefined();
    act(() => result.current.select({ kind: 'run', correlationId: 'c-1' }));
    act(() => result.current.selectWhere(new Set()));
    expect(result.current.where).toBe('downloads');
    expect(result.current.selection).toEqual({ kind: 'run', correlationId: 'c-1' });
    expect(result.current.isFiltered).toBe(true);
    await waitFor(() => expect(result.current.entries.map((entry) => entry.key)).toEqual(['incident:9', 'run:c-1']));

    expect(listIncidents).toHaveBeenLastCalledWith('downloads');
    expect(listRuns).toHaveBeenCalledExactlyOnceWith('downloads');

    act(() => result.current.clearFilter());
    expect(result.current.where).toBe('all');
    expect(result.current.selection).toBeUndefined();
  });

  it('opens the incident another tab asked for, and a later request too', async () => {
    const source = sourceWith(() => Promise.resolve([]));
    const first: ActivityIncidentOpenRequest = { incidentId: 9 };
    const { result, rerender } = renderHook(({ request }) => useActivityIncidents(request, source), { initialProps: { request: first as ActivityIncidentOpenRequest | undefined } });

    expect(result.current.selection).toEqual({ kind: 'incident', id: 9 });
    expect(result.current.selectedKey).toBe('incident:9');

    act(() => result.current.select({ kind: 'run', correlationId: 'c-1' }));
    rerender({ request: first });
    expect(result.current.selection).toEqual({ kind: 'run', correlationId: 'c-1' });

    rerender({ request: { incidentId: 4 } });
    expect(result.current.selection).toEqual({ kind: 'incident', id: 4 });
    rerender({ request: undefined });
    expect(result.current.selection).toEqual({ kind: 'incident', id: 4 });
    await waitFor(() => expect(result.current.list.status).toBe('ready'));
  });

  it('shows the failure of either read, then reads again on retry', async () => {
    const listIncidents = vi.fn().mockRejectedValueOnce(new Error('locked')).mockRejectedValueOnce(new Error('locked')).mockResolvedValueOnce([incident(1)]);
    const source = sourceWith(listIncidents);
    const { result } = renderHook(() => useActivityIncidents(undefined, source));
    await waitFor(() => expect(result.current.list.status).toBe('failed'));
    expect(result.current.entries).toEqual([]);

    act(() => result.current.retry());
    expect(result.current.list.status).toBe('loading');
    await waitFor(() => expect(result.current.list.status).toBe('failed'));
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.list.status).toBe('ready'));
    expect(listIncidents).toHaveBeenCalledTimes(3);
  });

  it('drops the answer of a filter that is no longer selected', async () => {
    let resolveAll: (rows: readonly ActivityIncidentSummary[]) => void = () => undefined;
    const listIncidents = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveAll = resolve)))
      .mockResolvedValueOnce([incident(2)]);
    const source = sourceWith(listIncidents);
    const { result } = renderHook(() => useActivityIncidents(undefined, source));

    act(() => result.current.selectWhere(new Set(['phone'])));
    await waitFor(() => expect(result.current.list.status).toBe('ready'));
    await act(async () => resolveAll([incident(1)]));

    expect(result.current.entries.map((entry) => entry.key)).toEqual(['incident:2']);
  });

  it('renders one progressive batch of a long list', async () => {
    const source = sourceWith(() => Promise.resolve(Array.from({ length: 45 }, (_unused, index) => incident(index + 1))));
    const { result } = renderHook(() => useActivityIncidents(undefined, source));
    await waitFor(() => expect(result.current.list.status).toBe('ready'));

    expect(result.current.entries).toHaveLength(45);
    expect(result.current.visibleCount).toBe(20);
  });
});
