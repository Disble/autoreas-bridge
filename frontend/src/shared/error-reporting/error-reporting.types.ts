import type { ReactNode } from 'react';

/** Where a frontend failure surfaced: a window error, an unhandled rejection, or a React render. */
export type FrontendErrorKind = 'error' | 'unhandledrejection' | 'render';

/** One frontend or WebView failure, in the shape the `ReportFrontendError` binding accepts. */
export type FrontendErrorReport = {
  readonly kind: FrontendErrorKind;
  readonly message: string;
  readonly stack: string;
  readonly source: string;
  readonly route: string;
  readonly occurredAtMs: number;
};

/** Where and when a failure happened, captured by the caller that saw it. */
export type FrontendErrorContext = {
  readonly source: string;
  readonly route: string;
  readonly occurredAtMs: number;
  /** React's component stack, present only for render errors. */
  readonly componentStack?: string;
};

/** Reports one failure. Implementations never throw. */
export type ReportFrontendError = (report: FrontendErrorReport) => void;

/** Delivers a report to the bridge; may throw or reject, the reporter contains both. */
export type SendFrontendErrorReport = (report: FrontendErrorReport) => Promise<string>;

/** Dependencies of `createErrorReporter`. */
export type ErrorReporterOptions = {
  readonly send: SendFrontendErrorReport;
  readonly now: () => number;
  /** A report identical to one sent less than this many ms ago is dropped. */
  readonly throttleMs: number;
};

/** Props of `FrontendErrorBoundary`. */
export type FrontendErrorBoundaryProps = {
  readonly children: ReactNode;
  /** Reporter for render errors; defaults to the shared bridge reporter. */
  readonly report?: ReportFrontendError;
  /** Reloads the window from the fallback; defaults to `window.location.reload`. */
  readonly onReload?: () => void;
};

/** State of `FrontendErrorBoundary`. */
export type FrontendErrorBoundaryState = {
  readonly hasError: boolean;
};

/** Props of `FrontendErrorFallback`. */
export type FrontendErrorFallbackProps = {
  readonly onReload: () => void;
};
