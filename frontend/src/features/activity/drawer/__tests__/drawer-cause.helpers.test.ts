import { describe, expect, it } from 'vitest';
import { fillDrawerCauseSentence, toDrawerCause } from '../drawer-cause.helpers';
import { incident } from './drawer.fixtures';

describe('toDrawerCause', () => {
  it.each([
    ['a catalogued code reads its sentence and keeps the code chip', 'conflict', 'applied: false, reason: conflict', undefined, true, 'conflict'],
    ['an unknown code shows the recorded message with the code chip', 'stale_version', 'raw text', undefined, false, 'stale_version'],
    ['no code falls back to the HTTP status of the triggering request', '', 'invalid bearer token', 401, false, 'HTTP 401'],
    ['no code and no status leaves the chip empty', '', 'boom', undefined, false, ''],
  ])('%s', (_name, errorCode, message, status, hasSentence, code) => {
    const detail = incident({
      cause: { known: true, errorCode, message },
      requests:
        status === undefined
          ? []
          : [{ routeTemplate: '/api/sync/reconcile', httpStatus: status, count: 1, firstAtMs: 1, lastAtMs: 1, latestRequestId: 'r', kind: 'http', outcome: 'x', maxDurationMs: 3, containsTrigger: true }],
    });

    const cause = toDrawerCause(detail);

    expect(cause?.code).toBe(code);
    expect(cause?.recordedMessage).toBe(message);
    expect(cause?.sentence !== undefined).toBe(hasSentence);
  });

  it('is undefined when the cause is not known', () => {
    expect(toDrawerCause(incident({ cause: { known: false, errorCode: '', message: '' } }))).toBeUndefined();
  });

  it('ignores the status of a request that did not trigger the incident', () => {
    const detail = incident({
      cause: { known: true, errorCode: '', message: 'm' },
      requests: [{ routeTemplate: '/a', httpStatus: 500, count: 1, firstAtMs: 1, lastAtMs: 1, latestRequestId: 'r', kind: 'http', outcome: 'x', maxDurationMs: 3, containsTrigger: false }],
    });

    expect(toDrawerCause(detail)?.code).toBe('');
  });
});

describe('fillDrawerCauseSentence', () => {
  it('fills known placeholders and keeps a missing one visible', () => {
    expect(fillDrawerCauseSentence('{anime} failed on {host}', { anime: 'Bleach' })).toBe('Bleach failed on {host}');
  });
});
