import type { MODULE_IDS } from './readiness.constants';

/**
 * Lifecycle state of one backend module (ADR-032 §1, `internal/lifecycle`).
 * `ready` and `failed` are terminal: a module never moves out of them.
 */
export type ReadinessState = 'starting' | 'ready' | 'failed';

/**
 * Every module the composition root registers, built from `MODULE_IDS` (kept in
 * parity with Go `registeredModules` through `internal/lifecycle/modules.json`).
 * A query names one of these to wait for its readiness.
 */
export type ModuleId = (typeof MODULE_IDS)[number];

/**
 * One module's readiness, as `GetReadiness()` and each `bridge.readiness`
 * event report it. `reason` is set only when the module failed.
 */
export interface ModuleReadiness {
  readonly module: string;
  readonly state: ReadinessState;
  readonly reason?: string;
}

/**
 * Port the readiness gate (`shared/query`) depends on; the Wails adapter lives in
 * `infrastructure/readiness`. `getReadiness` rejects with a `BridgeError`.
 */
export interface ReadinessSource {
  /** Answers every module's readiness, in registration order. */
  readonly getReadiness: () => Promise<readonly ModuleReadiness[]>;
  /** Receives each later transition; returns the unsubscribe function. */
  readonly subscribe: (listener: (status: ModuleReadiness) => void) => () => void;
}
