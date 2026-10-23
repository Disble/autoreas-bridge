import { describe, expect, it, vi } from 'vitest';
import type { ActivityRunStep } from '../../activity-source/activity-incident.types';
import type { ActivityFeedSource } from '../../feed-source/feed-source.types';
import { readDrawerEvent, toDrawerEventId, toDrawerEventMetadata } from '../drawer-reads.helpers';
import { feedLine } from './drawer.fixtures';

/** A stored event with the given metadata JSON. */
function event(metadataJson: string): ActivityRunStep {
  return { id: 12, atMs: 1, domain: 'frontend', level: 'error', eventType: 'frontend.error', message: 'm', correlationId: '', durationMs: undefined, metadataJson };
}

describe('toDrawerEventId', () => {
  it.each([
    ['an event line reads its numeric id', 'event', '12', 12],
    ['a non-event line reads nothing', 'change', '12', undefined],
    ['an id that is not a positive integer reads nothing', 'event', 'x1', undefined],
    ['a zero id reads nothing', 'event', '0', undefined],
  ])('%s', (_name, kind, id, expected) => {
    expect(toDrawerEventId(feedLine({}, { kind, id }))).toBe(expected);
  });
});

describe('toDrawerEventMetadata', () => {
  it.each([
    ['strings as stored and anything else as JSON', '{"route":"/editor","occurredAtMs":17,"rows":["a"]}', { route: '/editor', occurredAtMs: '17', rows: '["a"]' }],
    ['no metadata', '', undefined],
    ['unreadable JSON', '{bad', undefined],
    ['a JSON array', '[1]', undefined],
    ['JSON null', 'null', undefined],
  ])('reads %s', (_name, json, expected) => {
    expect(toDrawerEventMetadata(event(json))).toEqual(expected);
  });

  it('reads nothing when the event is gone', () => {
    expect(toDrawerEventMetadata(undefined)).toBeUndefined();
  });
});

describe('readDrawerEvent', () => {
  it.each([
    ['ready when stored', event('{}'), 'ready'],
    ['gone when no event has the id', undefined, 'gone'],
  ])('is %s', async (_name, stored, status) => {
    const getEvent = vi.fn(() => Promise.resolve(stored));

    const read = await readDrawerEvent({ getEvent } as unknown as ActivityFeedSource, 12);

    expect(getEvent).toHaveBeenCalledExactlyOnceWith(12);
    expect(read.status).toBe(status);
  });
});
