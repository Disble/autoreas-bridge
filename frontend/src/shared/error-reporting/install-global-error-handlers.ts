import { ReportFrontendError as callReportFrontendError } from '../../../wailsjs/go/desktop/App';
import { desktop } from '../../../wailsjs/go/models';
import { hasGoBinding } from '../../infrastructure/wails-bindings.helpers';
import { FRONTEND_ERROR_BINDING, FRONTEND_ERROR_THROTTLE_MS } from './error-reporting.constants';
import { buildFrontendErrorReport, createErrorReporter, formatErrorSource } from './error-reporting.helpers';
import type { FrontendErrorContext, FrontendErrorReport, ReportFrontendError } from './error-reporting.types';

/** Targets that already carry the handlers, so a second install is a no-op. */
const installedTargets = new WeakSet<EventTarget>();

/**
 * Delivers a report to the bridge through the bound Go method. Outside the
 * desktop shell, or before Wails attaches its bindings, there is nowhere to
 * send it and the report is dropped.
 * @param report The report.
 * @returns The binding's "ok" or error string.
 */
export function sendReportToBridge(report: FrontendErrorReport): Promise<string> {
  if (!hasGoBinding(FRONTEND_ERROR_BINDING)) {
    return Promise.resolve('bindings unavailable');
  }
  return callReportFrontendError(desktop.FrontendErrorReport.createFrom(report));
}

/** The one reporter the whole app shares, so its throttle and loop guard cover every source. */
export const frontendErrorReporter: ReportFrontendError = createErrorReporter({
  send: sendReportToBridge,
  now: () => Date.now(),
  throttleMs: FRONTEND_ERROR_THROTTLE_MS,
});

/**
 * Captures where and when a failure happened in the running window.
 * @param source The blamed location, blank when unknown.
 * @param componentStack React's component stack, for render errors.
 * @returns The report context.
 */
export function readBrowserErrorContext(source: string, componentStack?: string): FrontendErrorContext {
  return { source, route: window.location.hash || '#/', occurredAtMs: Date.now(), componentStack };
}

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
