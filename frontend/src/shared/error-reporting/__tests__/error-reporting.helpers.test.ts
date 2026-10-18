import { describe, expect, it, vi } from 'vitest';
import {
  FRONTEND_ERROR_MESSAGE_LIMIT,
  FRONTEND_ERROR_STACK_LIMIT,
  FRONTEND_ERROR_THROTTLE_KEY_LIMIT,
  FRONTEND_ERROR_UNKNOWN_MESSAGE,
} from '../error-reporting.constants';
import { buildFrontendErrorReport, createErrorReporter, formatErrorSource } from '../error-reporting.helpers';
import type { FrontendErrorReport } from '../error-reporting.types';

/** A fixed context every report in these scenarios is built against. */
const CONTEXT = { source: 'main.tsx:1:2', route: '#/catalog', occurredAtMs: 1_700_000_000_123 };

/**
 * Builds a minimal valid report for reporter scenarios.
 * @param message The report message, which also drives the throttle key.
 * @returns A report of kind `error`.
 */
function report(message: string): FrontendErrorReport {
  return { kind: 'error', message, stack: '', source: 'a.ts:1:1', route: '#/', occurredAtMs: 1 };
}

describe('buildFrontendErrorReport', () => {
  it('keeps the message, stack and context of a thrown Error', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at a.ts:1';

    expect(buildFrontendErrorReport('render', error, CONTEXT)).toEqual({
      kind: 'render',
      message: 'boom',
      stack: 'Error: boom\n    at a.ts:1',
      ...CONTEXT,
    });
  });

  it('appends the component stack to the error stack', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom';

    const built = buildFrontendErrorReport('render', error, { ...CONTEXT, componentStack: '\n    at Catalog' });

    expect(built.stack).toBe('Error: boom\nComponent stack:\n    at Catalog');
  });

  it('falls back to the error name when an Error has no message', () => {
    const error = new TypeError('');
    error.stack = undefined;

    expect(buildFrontendErrorReport('error', error, CONTEXT)).toMatchObject({ message: 'TypeError', stack: '' });
  });

  it.each([
    ['a string reason', 'network down', 'network down'],
    ['an object reason', { code: 42 }, '{"code":42}'],
    ['a number reason', 7, '7'],
    ['an undefined reason', undefined, FRONTEND_ERROR_UNKNOWN_MESSAGE],
    ['a null reason', null, FRONTEND_ERROR_UNKNOWN_MESSAGE],
    ['a blank string reason', '   ', FRONTEND_ERROR_UNKNOWN_MESSAGE],
  ])('turns %s into a non-blank message', (_label, reason, message) => {
    expect(buildFrontendErrorReport('unhandledrejection', reason, CONTEXT)).toMatchObject({ message, stack: '' });
  });

  it('never throws on a reason that cannot be serialized', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(buildFrontendErrorReport('unhandledrejection', circular, CONTEXT).message).toBe('[object Object]');
  });

  it('bounds the message and the stack', () => {
    const error = new Error('m'.repeat(FRONTEND_ERROR_MESSAGE_LIMIT + 10));
    error.stack = 's'.repeat(FRONTEND_ERROR_STACK_LIMIT + 10);

    const built = buildFrontendErrorReport('error', error, CONTEXT);

    expect(built.message).toHaveLength(FRONTEND_ERROR_MESSAGE_LIMIT);
    expect(built.stack).toHaveLength(FRONTEND_ERROR_STACK_LIMIT);
  });
});

describe('formatErrorSource', () => {
  it('joins the file, line and column of a window error', () => {
    expect(formatErrorSource('app.js', 3, 9)).toBe('app.js:3:9');
  });

  it('is empty when the browser gives no file', () => {
    expect(formatErrorSource('', 0, 0)).toBe('');
  });
});

describe('createErrorReporter', () => {
  it('sends a report to the bridge once', () => {
    const send = vi.fn().mockResolvedValue('ok');
    const reporter = createErrorReporter({ send, now: () => 0, throttleMs: 1_000 });

    reporter(report('boom'));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(report('boom'));
  });

  it('drops a duplicate inside the throttle window and sends it again after', () => {
    const send = vi.fn().mockResolvedValue('ok');
    // A non-zero start keeps the window relative to the last send, not to the epoch.
    let now = 500;
    const reporter = createErrorReporter({ send, now: () => now, throttleMs: 1_000 });

    reporter(report('boom'));
    now = 1_499;
    reporter(report('boom'));
    expect(send).toHaveBeenCalledTimes(1);

    reporter(report('other'));
    expect(send).toHaveBeenCalledTimes(2);

    now = 1_500;
    reporter(report('boom'));
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('forgets the oldest throttle key once the key limit is reached', () => {
    const send = vi.fn().mockResolvedValue('ok');
    const reporter = createErrorReporter({ send, now: () => 0, throttleMs: 1_000 });

    for (let index = 0; index <= FRONTEND_ERROR_THROTTLE_KEY_LIMIT; index += 1) {
      reporter(report(`error ${index}`));
    }
    reporter(report('error 1'));
    reporter(report('error 0'));

    // 'error 0' was evicted, so it is sent again; 'error 1' is still throttled.
    expect(send).toHaveBeenCalledTimes(FRONTEND_ERROR_THROTTLE_KEY_LIMIT + 2);
  });

  it('swallows a send that throws or rejects', async () => {
    const throwing = createErrorReporter({ send: () => { throw new Error('no bridge'); }, now: () => 0, throttleMs: 0 });
    const rejecting = createErrorReporter({ send: () => Promise.reject(new Error('no bridge')), now: () => 0, throttleMs: 0 });

    expect(() => throwing(report('a'))).not.toThrow();
    expect(() => rejecting(report('a'))).not.toThrow();
    await Promise.resolve();
  });

  it('drops a report raised while a report is being sent, so a failing report cannot loop', () => {
    const sent: string[] = [];
    let reporter: (value: FrontendErrorReport) => void = () => undefined;
    reporter = createErrorReporter({
      send: (value) => {
        sent.push(value.message);
        reporter(report('raised by the send'));
        return Promise.resolve('ok');
      },
      now: () => 0,
      throttleMs: 0,
    });

    reporter(report('first'));
    reporter(report('second'));

    expect(sent).toEqual(['first', 'second']);
  });
});
