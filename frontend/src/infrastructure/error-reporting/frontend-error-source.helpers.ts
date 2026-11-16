import { ReportFrontendError as callReportFrontendError } from '../../../wailsjs/go/desktop/App';
import { desktop } from '../../../wailsjs/go/models';
import { FRONTEND_ERROR_BINDING, FRONTEND_ERROR_THROTTLE_MS } from '../../shared/error-reporting/error-reporting.constants';
import { createErrorReporter } from '../../shared/error-reporting/error-reporting.helpers';
import type { FrontendErrorReport, ReportFrontendError } from '../../shared/error-reporting/error-reporting.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { hasGoBinding } from '../wails-bindings.helpers';

/**
 * Delivers a report to the bridge through the bound Go method, which records it
 * through the always-ready shell handle. Outside the desktop shell, or before
 * Wails attaches its bindings, there is nowhere to send it: the call rejects as
 * `unavailable` at once, and the reporter drops the report.
 * @param report The report.
 * @returns Resolves once the bridge recorded it; rejects with a `BridgeError`.
 */
export function sendReportToBridge(report: FrontendErrorReport): Promise<void> {
  if (!hasGoBinding(FRONTEND_ERROR_BINDING)) {
    return Promise.reject(createBridgeError('unavailable', `the ${FRONTEND_ERROR_BINDING} binding is not attached`));
  }
  return withBridgeErrors(callReportFrontendError(desktop.FrontendErrorReport.createFrom(report)));
}

/** The one reporter the whole app shares, so its throttle and loop guard cover every source. */
export const frontendErrorReporter: ReportFrontendError = createErrorReporter({ // eslint-disable-line dharness/role-file-shape
  send: sendReportToBridge,
  now: () => Date.now(),
  throttleMs: FRONTEND_ERROR_THROTTLE_MS,
});
