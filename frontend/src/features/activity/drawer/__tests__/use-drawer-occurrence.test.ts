import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityIncidentDetail, ActivityRunStep } from '../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import type { ActivityFeedSource } from '../../feed-source/feed-source.types';
import type { DrawerWindowErrorDetail } from '../drawer.types';
import { useDrawerOccurrence } from '../use-drawer-occurrence';
import { incident } from './drawer.fixtures';

/** The line's own stored window error. */
const CURRENT: DrawerWindowErrorDetail = { facts: [], message: 'now', stack: '', stackCut: false };

/** Occurrence 93 of a repeated window error, with earlier occurrence 92. */
const REPEATED = incident({ incident: { ...incident().incident, id: 93 }, earlier: [{ id: 92, occurredAtMs: 5000 }] });

/** Occurrence 92 as stored: fired by event 40467 with no stored source id. */
function earlier(atMs: number): ActivityIncidentDetail {
  const event = { id: 40467, atMs, domain: 'frontend', level: 'error', eventType: 'frontend.error', message: 'then', correlationId: '' };
  return incident({ incident: { ...incident().incident, id: 92, occurredAtMs: 5000, sourceKind: 'event', sourceId: '' }, events: [event] });
}

/** Event 40467 as stored, with its window-error metadata. */
const EVENT: ActivityRunStep = {
  id: 40467,
  atMs: 5000,
  domain: 'frontend',
  level: 'error',
  eventType: 'frontend.error',
  message: 'then',
  correlationId: '',
  durationMs: undefined,
  metadataJson: JSON.stringify({ kind: 'error', message: 'earlier boom', stack: 'at B' }),
};

/** A source whose incident read is the given spy. */
function sourceWith(getIncident: ActivitySource['getIncident']): ActivitySource {
  return { getIncident } as unknown as ActivitySource;
}

/** A feed source whose event read is the given spy. */
function feedWith(getEvent: ActivityFeedSource['getEvent']): ActivityFeedSource {
  return { getEvent } as unknown as ActivityFeedSource;
}

describe('useDrawerOccurrence', () => {
  it.each([
    ['a line without a window error', REPEATED, undefined],
    ['a window error that did not repeat', incident(), CURRENT],
  ])('lists no occurrences for %s', (_name, detail, current) => {
    const source = sourceWith(vi.fn());
    const feed = feedWith(vi.fn());
    const { result } = renderHook(() => useDrawerOccurrence(source, feed, 'line', detail, current));

    expect(result.current.occurrences).toEqual([]);
    expect(result.current.selectedOccurrenceId).toBeUndefined();
  });

  it('shows this occurrence first without reading anything', () => {
    const getIncident = vi.fn();
    const source = sourceWith(getIncident);
    const feed = feedWith(vi.fn());
    const { result } = renderHook(() => useDrawerOccurrence(source, feed, 'line', REPEATED, CURRENT));

    expect(result.current.occurrences.map((occurrence) => occurrence.id)).toEqual([93, 92]);
    expect(result.current.selectedOccurrenceId).toBe(93);
    expect(result.current.windowError).toBe(CURRENT);
    expect(result.current.occurrenceStatus).toBe('ready');
    expect(getIncident).not.toHaveBeenCalled();
  });

  it('reads a picked earlier occurrence, then shows the error its event stored', async () => {
    const getIncident = vi.fn(() => Promise.resolve(earlier(5000)));
    const getEvent = vi.fn(() => Promise.resolve(EVENT));
    const source = sourceWith(getIncident);
    const feed = feedWith(getEvent);
    const { result } = renderHook(() => useDrawerOccurrence(source, feed, 'line', REPEATED, CURRENT));

    act(() => result.current.pickOccurrence(92));

    expect(result.current.selectedOccurrenceId).toBe(92);
    expect(result.current.occurrenceStatus).toBe('loading');
    await waitFor(() => expect(result.current.windowError).toMatchObject({ message: 'earlier boom', stack: 'at B' }));
    expect(result.current.occurrenceStatus).toBe('ready');
    expect(getIncident).toHaveBeenCalledWith(92);
    expect(getEvent).toHaveBeenCalledWith(40467);
  });

  it('fails an earlier occurrence whose firing event is not in its window, and reads it again on retry', async () => {
    const getIncident = vi.fn(() => Promise.resolve(earlier(4000)));
    const getEvent = vi.fn();
    const source = sourceWith(getIncident);
    const feed = feedWith(getEvent);
    const { result } = renderHook(() => useDrawerOccurrence(source, feed, 'line', REPEATED, CURRENT));

    act(() => result.current.pickOccurrence(92));

    await waitFor(() => expect(result.current.occurrenceStatus).toBe('failed'));
    expect(result.current.windowError).toBeUndefined();
    expect(getEvent).not.toHaveBeenCalled();
    act(() => result.current.retryOccurrence());
    await waitFor(() => expect(getIncident).toHaveBeenCalledTimes(2));
  });

  it('forgets a pick made in another line', () => {
    const source = sourceWith(vi.fn(() => new Promise<never>(() => {})));
    const feed = feedWith(vi.fn());
    const { result, rerender } = renderHook(({ lineKey }) => useDrawerOccurrence(source, feed, lineKey, REPEATED, CURRENT), {
      initialProps: { lineKey: 'a' },
    });

    act(() => result.current.pickOccurrence(92));
    rerender({ lineKey: 'b' });

    expect(result.current.selectedOccurrenceId).toBe(93);
    expect(result.current.windowError).toBe(CURRENT);
  });
});
