import { describe, expect, it, vi } from 'vitest';
import type { ActivityRunStep } from '../../../../shared/contracts/activity-incident.types';
import type { ActivityFeedSource } from '../../../../shared/contracts/activity.types';
import { readDrawerChangeContext, readDrawerEvent, toDrawerChangeKey, toDrawerEventId, toDrawerEventMetadata, toDrawerStoryId } from '../drawer-reads.helpers';
import { feedLine } from './drawer.fixtures';

/** A stored event with the given metadata JSON. */
function event(metadataJson: string): ActivityRunStep {
  return { id: 12, atMs: 1, domain: 'frontend', level: 'error', eventType: 'frontend.error', message: 'm', correlationId: '', durationMs: undefined, metadataJson };
}

describe('toDrawerEventId', () => {
  it('reads the numeric id of an event line and nothing otherwise', () => {
    const cases = [
      ['an event line reads its numeric id', 'event', '12', 12],
      ['a non-event line reads nothing', 'change', '12', undefined],
      ['an id that is not a positive integer reads nothing', 'event', 'x1', undefined],
      ['a zero id reads nothing', 'event', '0', undefined],
    ] as const;

    for (const [caseName, kind, id, expected] of cases) {
      expect.soft(toDrawerEventId(feedLine({}, { kind, id })), caseName).toBe(expected);
    }
  });
});

describe('toDrawerEventMetadata', () => {
  it('reads stored metadata as strings and JSON, and nothing when missing or unreadable', () => {
    const cases = [
      ['strings as stored and anything else as JSON', '{"route":"/editor","occurredAtMs":17,"rows":["a"]}', { route: '/editor', occurredAtMs: '17', rows: '["a"]' }],
      ['no metadata', '', undefined],
      ['unreadable JSON', '{bad', undefined],
      ['a JSON array', '[1]', undefined],
      ['JSON null', 'null', undefined],
    ] as const;

    for (const [caseName, json, expected] of cases) {
      expect.soft(toDrawerEventMetadata(event(json)), caseName).toEqual(expected);
    }
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

describe('toDrawerChangeKey', () => {
  it('reads the change key of a change line and nothing for another kind', () => {
    const cases = [
      ['a change line reads its id and time', 'change', '872', '872@1792801492755'],
      ['another kind reads nothing', 'event', '872', undefined],
      ['a non-numeric id reads nothing', 'change', 'c-1', undefined],
      ['a zero id reads nothing', 'change', '0', undefined],
    ] as const;

    for (const [caseName, kind, id, expected] of cases) {
      expect.soft(toDrawerChangeKey(feedLine({}, { kind, id, atMs: 1792801492755 })), caseName).toBe(expected);
    }
  });
});

describe('readDrawerChangeContext', () => {
  it.each([
    ['ready when stored', { events: [], truncated: false, requests: [] }, 'ready'],
    ['gone when no change has the id', undefined, 'gone'],
  ])('is %s', async (_name, stored, status) => {
    const getChangeContext = vi.fn(() => Promise.resolve(stored));

    const read = await readDrawerChangeContext({ getChangeContext } as unknown as ActivityFeedSource, '872@1792801492755');

    expect(getChangeContext).toHaveBeenCalledExactlyOnceWith(872, 1792801492755);
    expect(read.status).toBe(status);
  });
});

describe('toDrawerStoryId', () => {
  it('reads the story id of a run or task from its correlation id, and nothing otherwise', () => {
    const cases = [
      ['a download run reads its correlation id, the run id', 'download_run', 'download', 'run-1', 'run-1'],
      ['a task event reads its correlation id', 'event', 'season', 'c-1', 'c-1'],
      ['another event reads nothing, its summary shows no run story', 'event', 'api', 'c-1', undefined],
      ['a run without one reads nothing', 'download_run', 'download', '', undefined],
    ] as const;

    for (const [caseName, kind, domain, correlationId, expected] of cases) {
      expect.soft(toDrawerStoryId(feedLine({}, { kind, domain, correlationId })), caseName).toBe(expected);
    }
  });
});
