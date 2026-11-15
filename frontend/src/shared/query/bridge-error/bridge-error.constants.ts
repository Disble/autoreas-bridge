import type { BridgeErrorCode } from './bridge-error.types';

/**
 * Every failure code, in the order of `internal/apperr/error-codes.json`; a
 * Vitest test (`infrastructure/bridge-error`) fails when the two drift.
 */
export const BRIDGE_ERROR_CODES: readonly BridgeErrorCode[] = [
  'unavailable',
  'failed_precondition',
  'invalid_argument',
  'not_found',
  'internal',
];

/** `Error.name` every `BridgeError` carries, so a guard can tell it apart. */
export const BRIDGE_ERROR_NAME = 'BridgeError';
