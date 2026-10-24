import { afterEach, describe, expect, it } from 'vitest';
import { DRAWER_CAUSE_CATALOG } from '../drawer.constants';
import { fillDrawerCauseSentence, toDrawerCause, toDrawerCauseGap } from '../drawer-cause.helpers';
import { incident } from './drawer.fixtures';

describe('toDrawerCause', () => {
  it.each([
    ['a code without approved wording shows its recorded message with its code chip', 'conflict', 'applied: false, reason: conflict', undefined, false, 'conflict'],
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

/** The catalog as a test may extend it; the entry added here is removed after each test. */
const CATALOG = DRAWER_CAUSE_CATALOG as Record<string, string>;

describe('the cause catalog lookup', () => {
  afterEach(() => {
    delete CATALOG.test_code;
  });

  it('ships no approved wording, so every code is shown as recorded', () => {
    expect(Object.keys(DRAWER_CAUSE_CATALOG)).toEqual([]);
  });

  it('reads an entry by code, fills its placeholders, keeps the code chip and notes nothing', () => {
    CATALOG.test_code = 'Refused with {code} for {anime}.';
    const detail = incident({ cause: { known: true, errorCode: 'test_code', message: 'raw' } });

    expect(toDrawerCause(detail)).toEqual({ sentence: 'Refused with test_code for {anime}.', recordedMessage: 'raw', code: 'test_code' });
    expect(toDrawerCauseGap(detail)).toBeUndefined();
  });
});

describe('fillDrawerCauseSentence', () => {
  it('fills known placeholders and keeps a missing one visible', () => {
    expect(fillDrawerCauseSentence('{anime} failed on {host}', { anime: 'Bleach' })).toBe('Bleach failed on {host}');
  });
});
