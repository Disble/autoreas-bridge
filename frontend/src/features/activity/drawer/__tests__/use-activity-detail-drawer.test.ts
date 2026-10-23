import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import type { ActivityFeedLine } from '../../feed-source/feed.types';
import { useActivityDetailDrawer } from '../use-activity-detail-drawer';
import { feedLine, incident } from './drawer.fixtures';

/** A source whose reads are spies; unset reads reject. */
function sourceWith(reads: Partial<ActivitySource>): ActivitySource {
  return {
    getIncident: vi.fn(() => Promise.reject(new Error('no'))),
    getRunStory: vi.fn(() => Promise.reject(new Error('no'))),
    getRequest: vi.fn(() => Promise.reject(new Error('no'))),
    ...reads,
  } as unknown as ActivitySource;
}

/** A failed phone traffic hour with incident 7. */
const TRAFFIC = feedLine({ type: 'traffic', origin: 'phone', failed: true, incidentId: 7, traffic: { hourStartMs: 1, requests: 3, failed: 1, maxDurationMs: 9 } }, { kind: 'traffic_hour' });

/** Incident 7 with two folded groups. */
const DETAIL = incident({
  requests: [
    { routeTemplate: '/a', httpStatus: 401, count: 1, firstAtMs: 1, lastAtMs: 1, latestRequestId: 'r1', kind: 'http', outcome: 'x', maxDurationMs: 1, containsTrigger: true },
    { routeTemplate: '/b', httpStatus: 200, count: 2, firstAtMs: 1, lastAtMs: 1, latestRequestId: 'r2', kind: 'http', outcome: 'x', maxDurationMs: 1, containsTrigger: false },
  ],
});

describe('useActivityDetailDrawer', () => {
  it('reads nothing for a line without incident or correlation and is ready at once', () => {
    const source = sourceWith({});
    const { result } = renderHook(() => useActivityDetailDrawer(feedLine({}, { kind: 'event', detail: 'x.y' }), source));

    expect(result.current.status).toBe('ready');
    expect(source.getIncident).not.toHaveBeenCalled();
    expect(source.getRunStory).not.toHaveBeenCalled();
  });

  it('loads the incident once, then builds the summary from it', async () => {
    const getIncident = vi.fn(() => Promise.resolve(DETAIL));
    const source = sourceWith({ getIncident });
    const { result } = renderHook(() => useActivityDetailDrawer(TRAFFIC, source));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getIncident).toHaveBeenCalledExactlyOnceWith(7);
    expect(result.current.summary.sections.some((section) => section.kind === 'list')).toBe(true);
  });

  it('fails when the incident read rejects, and reads again on retry', async () => {
    const getIncident = vi.fn(() => Promise.reject(new Error('db')));
    const source = sourceWith({ getIncident });
    const { result } = renderHook(() => useActivityDetailDrawer(TRAFFIC, source));

    await waitFor(() => expect(result.current.status).toBe('failed'));
    act(() => result.current.retry());
    await waitFor(() => expect(getIncident).toHaveBeenCalledTimes(2));
  });

  it('reads the picked request only in the Requests tab, and the newly picked group on a pick', async () => {
    const getRequest = vi.fn(() => Promise.resolve(undefined));
    const source = sourceWith({ getIncident: vi.fn(() => Promise.resolve(DETAIL)), getRequest });
    const { result } = renderHook(() => useActivityDetailDrawer(TRAFFIC, source));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getRequest).not.toHaveBeenCalled();

    act(() => result.current.toggleTechnical());
    await waitFor(() => expect(getRequest).toHaveBeenCalledWith('r1'));
    act(() => result.current.pickGroup(result.current.requestGroups[1]!.key));
    await waitFor(() => expect(getRequest).toHaveBeenCalledWith('r2'));
    expect(result.current.selectedGroupKey).toBe(result.current.requestGroups[1]!.key);
  });

  it('keeps the technical view and tab across lines, falling back when a line lacks the tab', async () => {
    const source = sourceWith({ getIncident: vi.fn(() => Promise.resolve(DETAIL)), getRequest: vi.fn(() => Promise.resolve(undefined)) });
    const { result, rerender } = renderHook(({ line }: { readonly line: ActivityFeedLine }) => useActivityDetailDrawer(line, source), { initialProps: { line: TRAFFIC } });
    act(() => result.current.toggleTechnical());

    rerender({ line: feedLine({}, { kind: 'event', detail: 'x.y' }) });

    expect(result.current.technical).toBe(true);
    expect(result.current.tabs).toEqual(['events', 'data']);
    expect(result.current.tab).toBe('events');
  });

  it('reads the recorded metadata of an event through its run story', async () => {
    const getRunStory = vi.fn(() =>
      Promise.resolve({ correlationId: 'c-1', truncated: false, steps: [{ id: 12, atMs: 1, domain: 'app', level: 'warn', eventType: 'x.y', message: 'm', correlationId: 'c-1', durationMs: undefined, metadataJson: '{"free_bytes":412}' }] }),
    );
    const line = feedLine({}, { kind: 'event', id: '12', detail: 'x.y', correlationId: 'c-1' });
    const source = sourceWith({ getRunStory });
    const { result } = renderHook(() => useActivityDetailDrawer(line, source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const recorded = result.current.summary.sections.find((section) => section.key === 'recorded');
    expect(recorded).toMatchObject({ rows: [{ label: 'free_bytes', value: '412' }] });
  });
});
