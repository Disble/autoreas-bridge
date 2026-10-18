import {
  FRONTEND_ERROR_MESSAGE_LIMIT,
  FRONTEND_ERROR_STACK_LIMIT,
  FRONTEND_ERROR_THROTTLE_KEY_LIMIT,
  FRONTEND_ERROR_UNKNOWN_MESSAGE,
} from './error-reporting.constants';
import type {
  ErrorReporterOptions,
  FrontendErrorContext,
  FrontendErrorKind,
  FrontendErrorReport,
  ReportFrontendError,
} from './error-reporting.types';

/**
 * Turns any thrown value into a readable text. Serialization failures (a
 * circular object) fall back to `String`, so this never throws.
 * @param thrown The value that was thrown or rejected.
 * @returns The text, possibly blank.
 */
function describeThrown(thrown: unknown): string {
  if (typeof thrown === 'string') {
    return thrown;
  }
  if (thrown === undefined || thrown === null) {
    return '';
  }
  try {
    return typeof thrown === 'object' ? JSON.stringify(thrown) : String(thrown);
  } catch {
    return String(thrown);
  }
}

/**
 * Reads the message and stack of a thrown value.
 * @param thrown The value that was thrown or rejected.
 * @returns The message (never blank) and the stack (blank when unknown).
 */
function readThrown(thrown: unknown): { message: string; stack: string } {
  const isError = thrown instanceof Error;
  const text = isError ? thrown.message || thrown.name : describeThrown(thrown);
  const stack = isError ? (thrown.stack ?? '') : '';

  return { message: text.trim() === '' ? FRONTEND_ERROR_UNKNOWN_MESSAGE : text, stack };
}

/**
 * Builds the report the bridge records for one failure, bounding the message
 * and stack so a runaway value cannot bloat the IPC payload.
 * @param kind Where the failure surfaced.
 * @param thrown The value that was thrown or rejected.
 * @param context Where and when it happened.
 * @returns The report.
 */
export function buildFrontendErrorReport(
  kind: FrontendErrorKind,
  thrown: unknown,
  context: FrontendErrorContext,
): FrontendErrorReport {
  const { message, stack } = readThrown(thrown);
  const fullStack = context.componentStack === undefined ? stack : `${stack}\nComponent stack:${context.componentStack}`;

  return {
    kind,
    message: message.slice(0, FRONTEND_ERROR_MESSAGE_LIMIT),
    stack: fullStack.slice(0, FRONTEND_ERROR_STACK_LIMIT),
    source: context.source,
    route: context.route,
    occurredAtMs: context.occurredAtMs,
  };
}

/**
 * Formats the location of a window error.
 * @param filename The script the browser blamed.
 * @param line Its line.
 * @param column Its column.
 * @returns `file:line:column`, or blank when the browser named no file.
 */
export function formatErrorSource(filename: string, line: number, column: number): string {
  return filename === '' ? '' : `${filename}:${line}:${column}`;
}

/**
 * Identifies identical reports for throttling.
 * @param report The report.
 * @returns Its throttle key.
 */
function throttleKey(report: FrontendErrorReport): string {
  return `${report.kind}\u0000${report.message}\u0000${report.source}`;
}

/**
 * Records that a key was sent, forgetting the oldest key past the limit so the
 * throttle stays bounded over a long session.
 * @param sentAt Send times by key, in insertion order.
 * @param key The key just sent.
 * @param now When it was sent.
 */
function rememberSent(sentAt: Map<string, number>, key: string, now: number): void {
  sentAt.delete(key);
  sentAt.set(key, now);
  if (sentAt.size > FRONTEND_ERROR_THROTTLE_KEY_LIMIT) {
    const oldest = sentAt.keys().next().value;
    if (oldest !== undefined) {
      sentAt.delete(oldest);
    }
  }
}

/**
 * Creates the reporter every frontend failure goes through. It never throws:
 * a send that throws or rejects is swallowed and never reported, a report
 * raised while another is being sent is dropped, and an identical report
 * inside the throttle window is dropped, so reporting cannot loop.
 * @param options The sender, clock and throttle window.
 * @returns The reporter.
 */
export function createErrorReporter(options: ErrorReporterOptions): ReportFrontendError {
  const sentAt = new Map<string, number>();
  let isSending = false;

  return (report) => {
    if (isSending) {
      return;
    }
    isSending = true;
    try {
      const key = throttleKey(report);
      const now = options.now();
      const last = sentAt.get(key);
      if (last !== undefined && now - last < options.throttleMs) {
        return;
      }
      rememberSent(sentAt, key, now);
      options.send(report).catch(() => undefined);
    } catch {
      // Reporting is best effort and must never become a failure of its own.
    } finally {
      isSending = false;
    }
  };
}
