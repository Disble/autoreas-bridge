import type { ModuleId, ModuleReadiness } from '../../contracts/readiness.types';
import type { BridgeError } from '../bridge-error/bridge-error.types';

/**
 * What the gate knows: each module's latest readiness, and whether a
 * `GetReadiness()` snapshot has arrived (before it, an absent module is unknown).
 */
export interface ReadinessGateState {
  readonly modules: ReadonlyMap<string, ModuleReadiness>;
  readonly snapshotLoaded: boolean;
}

/**
 * The gate's answer for one module: run the query, keep it pending, or fail it
 * with the error the failure view shows.
 */
export type ReadinessGateDecision =
  | { readonly kind: 'run' }
  | { readonly kind: 'wait' }
  | { readonly kind: 'fail'; readonly error: BridgeError };

/** The readiness gate one `BridgeQueryProvider` owns. */
export interface ReadinessGate {
  /** Subscribes to transitions, then asks for the snapshot. Idempotent. */
  readonly start: () => void;
  /**
   * Resolves once `module` is ready and rejects with `failed_precondition`
   * once it failed. Aborting `signal` rejects with the signal's reason.
   */
  readonly whenReady: (module: ModuleId, signal?: AbortSignal) => Promise<void>;
}
