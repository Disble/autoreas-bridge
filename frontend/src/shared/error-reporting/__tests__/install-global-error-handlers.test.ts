import { afterEach, describe, expect, it, vi } from 'vitest';
import { installGlobalErrorHandlers } from '../install-global-error-handlers';

/** Removes any stubbed binding and spy a scenario left behind. */
afterEach(() => {
  delete window.go;
  vi.restoreAllMocks();
});

describe('installGlobalErrorHandlers', () => {
  it('installs once per target, reports errors and rejections once each with source and route, then stops', () => {
    const target = new EventTarget() as Window;
    const reporter = vi.fn();
    const uninstall = installGlobalErrorHandlers(target, reporter);
    const uninstallSecond = installGlobalErrorHandlers(target, reporter);
    const error = new Error('boom');

    target.dispatchEvent(new ErrorEvent('error', { error, message: 'boom', filename: 'app.js', lineno: 3, colno: 9 }));

    expect(reporter).toHaveBeenCalledTimes(1);
    // With no hash route the window is on the root route.
    expect(reporter.mock.calls[0][0]).toMatchObject({ kind: 'error', message: 'boom', source: 'app.js:3:9', route: '#/' });

    // A window error carrying no error object reports the event message.
    target.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));

    expect(reporter).toHaveBeenCalledTimes(2);
    expect(reporter.mock.calls[1][0]).toMatchObject({ kind: 'error', message: 'Script error.', source: '' });

    const rejection = new Event('unhandledrejection') as Event & { reason: unknown };
    rejection.reason = new Error('rejected');
    window.location.hash = '#/catalog';

    target.dispatchEvent(rejection);
    window.location.hash = '';

    expect(reporter).toHaveBeenCalledTimes(3);
    expect(reporter.mock.calls[2][0]).toMatchObject({
      kind: 'unhandledrejection',
      message: 'rejected',
      source: '',
      route: '#/catalog',
    });

    uninstallSecond();
    uninstall();
    target.dispatchEvent(new ErrorEvent('error', { message: 'two' }));
    target.dispatchEvent(new Event('unhandledrejection'));
    expect(reporter).toHaveBeenCalledTimes(3);
  });
});
