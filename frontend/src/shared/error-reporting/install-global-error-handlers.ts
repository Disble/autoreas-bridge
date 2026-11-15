import { BRIDGE_FRONTEND_ERROR_REPORTER } from '../query/bridge-runtime/bridge-runtime.constants';
import { buildFrontendErrorReport, formatErrorSource, readBrowserErrorContext } from './error-reporting.helpers';
import type { ReportFrontendError } from './error-reporting.types';

/** Targets that already carry the handlers, so a second install is a no-op. */
const installedTargets = new WeakSet<EventTarget>();

/** The one reporter the whole app shares, so its throttle and loop guard cover every source. */
export const frontendErrorReporter: ReportFrontendError = BRIDGE_FRONTEND_ERROR_REPORTER;

/**
 * Installs the window `error` and `unhandledrejection` handlers that turn
 * frontend and WebView failures into bridge events (P7). Installing twice on
 * the same target is a no-op.
 * @param target The window to listen on.
 * @param report The reporter every failure goes through.
 * @returns A function that removes the handlers.
 */
export function installGlobalErrorHandlers(target: Window, report: ReportFrontendError): () => void {
  if (installedTargets.has(target)) {
    return () => undefined;
  }
  installedTargets.add(target);

  /**
   * Reports an uncaught error.
   * @param event The browser's error event.
   */
  const onError = (event: ErrorEvent) => {
    const source = formatErrorSource(event.filename ?? '', event.lineno ?? 0, event.colno ?? 0);
    report(buildFrontendErrorReport('error', event.error ?? event.message, readBrowserErrorContext(source)));
  };
  /**
   * Reports a promise rejection nothing handled.
   * @param event The browser's rejection event.
   */
  const onRejection = (event: PromiseRejectionEvent) => {
    report(buildFrontendErrorReport('unhandledrejection', event.reason, readBrowserErrorContext('')));
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
    installedTargets.delete(target);
  };
}
