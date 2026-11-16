/**
 * Failure codes a Bridge binding can reject with (ADR-032 §2). The list is
 * `BRIDGE_ERROR_CODES`; `internal/apperr/error-codes.json` is its Go twin.
 */
export type BridgeErrorCode = 'unavailable' | 'failed_precondition' | 'invalid_argument' | 'not_found' | 'internal';

/**
 * A coded binding failure. `infrastructure/bridge-error` builds it from a Wails
 * rejection; `shared/query` reads it to decide retries and the failure view.
 */
export type BridgeError = Error & {
  readonly name: 'BridgeError';
  readonly code: BridgeErrorCode;
};
