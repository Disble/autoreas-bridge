import { afterEach, describe, expect, it, vi } from 'vitest';
import { installGlobalErrorHandlers } from '../install-global-error-handlers';

/** Uninstallers registered by a scenario, run after it. */
const uninstallers: Array<() => void> = [];

/** Removes every handler a scenario installed and any stubbed binding. */
afterEach(() => {
  uninstallers.splice(0).forEach((uninstall) => uninstall());
  delete window.go;
  vi.restoreAllMocks();
});

/**
 * Installs the handlers on a fresh event target with a recording reporter.
 * @returns The target and the reporter spy.
 */
function installOnFreshTarget() {
  const target = new EventTarget() as Window;
  const reporter = vi.fn();
  uninstallers.push(installGlobalErrorHandlers(target, reporter));
  return { target, reporter };
}

describe('installGlobalErrorHandlers', () => {
  it('reports a window error once with its source', () => {
    const { target, reporter } = installOnFreshTarget();
    const error = new Error('boom');

    target.dispatchEvent(new ErrorEvent('error', { error, message: 'boom', filename: 'app.js', lineno: 3, colno: 9 }));

    expect(reporter).toHaveBeenCalledTimes(1);
    // With no hash route the window is on the root route.
    expect(reporter.mock.calls[0][0]).toMatchObject({ kind: 'error', message: 'boom', source: 'app.js:3:9', route: '#/' });
  });

  it('reports the event message when a window error carries no error object', () => {
    const { target, reporter } = installOnFreshTarget();

    target.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));

    expect(reporter.mock.calls[0][0]).toMatchObject({ kind: 'error', message: 'Script error.', source: '' });
  });

  it('reports an unhandled rejection once with its reason', () => {
    const { target, reporter } = installOnFreshTarget();
    const rejection = new Event('unhandledrejection') as Event & { reason: unknown };
    rejection.reason = new Error('rejected');
    window.location.hash = '#/catalog';

    target.dispatchEvent(rejection);
    window.location.hash = '';

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter.mock.calls[0][0]).toMatchObject({
      kind: 'unhandledrejection',
      message: 'rejected',
      source: '',
      route: '#/catalog',
    });
  });

  it('installs once per target and stops reporting after uninstall', () => {
    const target = new EventTarget() as Window;
    const reporter = vi.fn();
    const uninstall = installGlobalErrorHandlers(target, reporter);
    const uninstallSecond = installGlobalErrorHandlers(target, reporter);

    target.dispatchEvent(new ErrorEvent('error', { message: 'one' }));
    expect(reporter).toHaveBeenCalledTimes(1);

    uninstallSecond();
    uninstall();
    target.dispatchEvent(new ErrorEvent('error', { message: 'two' }));
    target.dispatchEvent(new Event('unhandledrejection'));
    expect(reporter).toHaveBeenCalledTimes(1);
  });
});
