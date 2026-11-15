import { createBridgeError, isBridgeError, isBridgeErrorCode } from '../../shared/query/bridge-error/bridge-error.helpers';
import type { BridgeError } from '../../shared/query/bridge-error/bridge-error.types';

/**
 * Reads the coded failure a Wails rejection carries. The desktop
 * `ErrorFormatter` (`internal/desktop/app_readiness.go`) sends a coded failure
 * as the JSON string `{"code":…,"message":…}`, and Wails v2.15 rejects with
 * `new Error(thatString)`. Anything else is `internal` with its original text:
 * a legacy plain message, an argument-parse error, a call timeout, an unknown
 * code or a non-Error rejection. It never invents a fallback value.
 */
export function parseBridgeError(rejection: unknown): BridgeError {
  if (isBridgeError(rejection)) {
    return rejection;
  }
  if (!(rejection instanceof Error)) {
    return createBridgeError('internal', String(rejection));
  }

  return parseCodedFailure(rejection.message) ?? createBridgeError('internal', rejection.message);
}

/** Parses the formatter's JSON string; null when the text is not a coded failure. */
function parseCodedFailure(text: string): BridgeError | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null) {
    return null;
  }

  // Destructuring a JSON string, number or boolean yields undefined fields.
  const { code, message } = parsed as { code?: unknown; message?: unknown };
  return isBridgeErrorCode(code) && typeof message === 'string' ? createBridgeError(code, message) : null;
}

/**
 * Wraps a binding call so its rejection is always a `BridgeError`. Infrastructure
 * sources call bindings through this; `shared/query` then reads the code.
 */
export function withBridgeErrors<T>(call: Promise<T>): Promise<T> {
  return call.catch((rejection: unknown) => {
    throw parseBridgeError(rejection);
  });
}
