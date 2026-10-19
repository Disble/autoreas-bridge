/** Maximum message length sent to the bridge; the Go binding bounds it again in bytes. */
export const FRONTEND_ERROR_MESSAGE_LIMIT = 2_048;

/** Maximum stack length sent to the bridge; the Go binding bounds it again in bytes. */
export const FRONTEND_ERROR_STACK_LIMIT = 8_192;

/** An identical report inside this window is dropped, so a failing render loop sends one event. */
export const FRONTEND_ERROR_THROTTLE_MS = 5_000;

/** How many distinct reports the throttle remembers before forgetting the oldest. */
export const FRONTEND_ERROR_THROTTLE_KEY_LIMIT = 100;

/** Message used when a failure carries nothing readable; the bridge rejects a blank message. */
export const FRONTEND_ERROR_UNKNOWN_MESSAGE = '(no message)';

/** Name of the bound Go method that records a report. */
export const FRONTEND_ERROR_BINDING = 'ReportFrontendError';

/** Title of the fallback shown when the app fails to render. */
export const FRONTEND_ERROR_FALLBACK_TITLE = 'This screen could not be displayed';

/** Description of the fallback shown when the app fails to render. */
export const FRONTEND_ERROR_FALLBACK_DESCRIPTION =
  'The error was reported to the bridge Activity log. Reload the window to try again.';
