import { BRIDGE_ERROR_CODES, BRIDGE_ERROR_NAME } from './bridge-error.constants';
import type { BridgeError, BridgeErrorCode } from './bridge-error.types';

/** Tells whether a value is one of the known failure codes. */
export function isBridgeErrorCode(value: unknown): value is BridgeErrorCode {
  return BRIDGE_ERROR_CODES.includes(value as BridgeErrorCode);
}

/** Builds a coded failure carrying `message` as its text. */
export function createBridgeError(code: BridgeErrorCode, message: string): BridgeError {
  return Object.assign(new Error(message), { name: BRIDGE_ERROR_NAME, code }) as BridgeError;
}

/**
 * Tells whether an error is a `BridgeError`: an `Error` named `BridgeError`
 * whose code is a known one. Anything else is not trusted as coded.
 */
export function isBridgeError(error: unknown): error is BridgeError {
  return (
    error instanceof Error &&
    error.name === BRIDGE_ERROR_NAME &&
    isBridgeErrorCode((error as Partial<BridgeError>).code)
  );
}
