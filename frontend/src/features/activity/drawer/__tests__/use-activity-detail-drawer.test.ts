import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityRunStep } from '../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import type { ActivityFeedSource } from '../../feed-source/feed-source.types';
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

/** A feed source whose event read is the given spy. */
function feedWith(getEvent: ActivityFeedSource['getEvent']): ActivityFeedSource {
  return { getEvent } as unknown as ActivityFeedSource;
}

/** A feed source where no event is stored, for lines that are not about metadata. */
const FEED = feedWith(() => Promise.resolve(undefined));

/** Event 12 as stored, with the given metadata JSON. */
function stored(metadataJson: string): ActivityRunStep {
  return { id: 12, atMs: 1, domain: 'app', level: 'warn', eventType: 'x.y', message: 'm', correlationId: '', durationMs: undefined, metadataJson };
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
  it('reads nothing for a line that is neither an incident nor an event, and is ready at once', () => {
    const source = sourceWith({});
    const { result } = renderHook(() => useActivityDetailDrawer(feedLine({}, { kind: 'change' }), source, FEED));

    expect(result.current.status).toBe('ready');
    expect(source.getIncident).not.toHaveBeenCalled();
    expect(source.getRunStory).not.toHaveBeenCalled();
  });

  it('loads the incident once, then builds the summary from it', async () => {
    const getIncident = vi.fn(() => Promise.resolve(DETAIL));
    const source = sourceWith({ getIncident });
    const { result } = renderHook(() => useActivityDetailDrawer(TRAFFIC, source, FEED));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getIncident).toHaveBeenCalledExactlyOnceWith(7);
    expect(result.current.summary.sections.some((section) => section.kind === 'list')).toBe(true);
  });

  it('fails when the incident read rejects, and reads again on retry', async () => {
    const getIncident = vi.fn(() => Promise.reject(new Error('db')));
    const source = sourceWith({ getIncident });
    const { result } = renderHook(() => useActivityDetailDrawer(TRAFFIC, source, FEED));

    await waitFor(() => expect(result.current.status).toBe('failed'));
    act(() => result.current.retry());
    await waitFor(() => expect(getIncident).toHaveBeenCalledTimes(2));
  });

  it('reads the picked request only in the Requests tab, and the newly picked group on a pick', async () => {
    const getRequest = vi.fn(() => Promise.resolve(undefined));
    const source = sourceWith({ getIncident: vi.fn(() => Promise.resolve(DETAIL)), getRequest });
    const { result } = renderHook(() => useActivityDetailDrawer(TRAFFIC, source, FEED));
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
    const { result, rerender } = renderHook(({ line }: { readonly line: ActivityFeedLine }) => useActivityDetailDrawer(line, source, FEED), { initialProps: { line: TRAFFIC } });
    act(() => result.current.toggleTechnical());

    rerender({ line: feedLine({}, { kind: 'event', detail: 'x.y' }) });

    expect(result.current.technical).toBe(true);
    expect(result.current.tabs).toEqual(['events', 'data']);
    expect(result.current.tab).toBe('events');
  });

  it('reads the recorded metadata of an event by its id, without its run story', async () => {
    const getEvent = vi.fn(() => Promise.resolve(stored('{"free_bytes":412}')));
    const feed = feedWith(getEvent);
    const source = sourceWith({});
    const line = feedLine({}, { kind: 'event', id: '12', detail: 'x.y', correlationId: 'c-1' });
    const { result } = renderHook(() => useActivityDetailDrawer(line, source, feed));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getEvent).toHaveBeenCalledExactlyOnceWith(12);
    expect(source.getRunStory).not.toHaveBeenCalled();
    const recorded = result.current.summary.sections.find((section) => section.key === 'recorded');
    expect(recorded).toMatchObject({ rows: [{ label: 'free_bytes', value: '412' }] });
  });

  it('shows the window error from its stored metadata in the summary and the Data tab', async () => {
    const metadata = '{"kind":"render","route":"/editor","message":"boom","stack":"at A","source":"index.js:1:2","occurredAtMs":1}';
    const feed = feedWith(vi.fn(() => Promise.resolve(stored(metadata))));
    const line = feedLine({ failed: true }, { kind: 'event', id: '12', domain: 'frontend', level: 'error', detail: 'frontend.error' });
    const { result } = renderHook(() => useActivityDetailDrawer(line, sourceWith({}), feed));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.summary.gaps).toEqual([]);
    expect(result.current.windowError).toMatchObject({ message: 'boom', stack: 'at A' });
  });

  it.each([
    ['a gone event is ready without metadata', () => Promise.resolve(undefined), 'ready'],
    ['a failed event read fails the body', () => Promise.reject(new Error('db')), 'failed'],
  ])('%s', async (_name, answer, status) => {
    const getEvent = vi.fn(answer);
    const feed = feedWith(getEvent);
    const { result } = renderHook(() => useActivityDetailDrawer(feedLine({}, { kind: 'event', id: '12', detail: 'x.y' }), sourceWith({}), feed));

    await waitFor(() => expect(result.current.status).toBe(status));
    expect(result.current.summary.sections.some((section) => section.key === 'recorded')).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(getEvent).toHaveBeenCalledTimes(2));
  });
});
