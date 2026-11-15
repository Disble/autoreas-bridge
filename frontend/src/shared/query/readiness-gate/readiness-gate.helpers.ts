import type { ModuleId, ModuleReadiness, ReadinessSource } from '../../contracts/readiness.types';
import { createBridgeError } from '../bridge-error/bridge-error.helpers';
import { READINESS_RESYNC_DELAYS_MS } from './readiness-gate.constants';
import type { ReadinessGate, ReadinessGateDecision, ReadinessGateState, SettledListener } from './readiness-gate.types';

/** Tells whether a module already reached a state it can never leave. */
function isTerminal(entry: ModuleReadiness | undefined): boolean {
  return entry?.state === 'ready' || entry?.state === 'failed';
}

/**
 * Applies one transition. `ready` and `failed` are terminal (ADR-032 §1): once a
 * module reached one, a later report for it is stale and is ignored, so a
 * `GetReadiness()` snapshot older than an event never moves it back.
 */
export function mergeModuleReadiness(
  current: ReadonlyMap<string, ModuleReadiness>,
  incoming: ModuleReadiness,
): ReadonlyMap<string, ModuleReadiness> {
  if (isTerminal(current.get(incoming.module))) {
    return current;
  }

  return new Map(current).set(incoming.module, incoming);
}

/** Applies a whole snapshot, one entry at a time, under the terminal rule. */
export function mergeReadinessSnapshot(
  current: ReadonlyMap<string, ModuleReadiness>,
  snapshot: readonly ModuleReadiness[],
): ReadonlyMap<string, ModuleReadiness> {
  return snapshot.reduce(mergeModuleReadiness, current);
}

/**
 * Lists the modules `next` holds in a terminal state that `previous` did not:
 * under the terminal rule each module appears here once in a gate's life.
 */
function newlySettled(
  previous: ReadonlyMap<string, ModuleReadiness>,
  next: ReadonlyMap<string, ModuleReadiness>,
): ModuleReadiness[] {
  return [...next.values()].filter((entry) => isTerminal(entry) && !isTerminal(previous.get(entry.module)));
}

/** The delay before re-sync read `attempt` (0-based): the backoff, capped at its last step. */
function resyncDelay(attempt: number): number {
  return READINESS_RESYNC_DELAYS_MS[Math.min(attempt, READINESS_RESYNC_DELAYS_MS.length - 1)];
}

/**
 * Decides what a query for `module` does now: run when ready, wait while
 * starting (or before the snapshot says the module exists), fail with
 * `failed_precondition` and the module's reason when it failed, and fail with
 * `internal` when the loaded snapshot does not register it at all.
 */
export function decideGate(state: ReadinessGateState, module: ModuleId): ReadinessGateDecision {
  const entry = state.modules.get(module);
  if (entry?.state === 'ready') {
    return { kind: 'run' };
  }
  if (entry?.state === 'failed') {
    return { kind: 'fail', error: createBridgeError('failed_precondition', entry.reason || `${module} failed to start`) };
  }
  if (entry === undefined && state.snapshotLoaded) {
    return { kind: 'fail', error: createBridgeError('internal', `${module} is not a registered module`) };
  }

  return { kind: 'wait' };
}

/** One pending `whenReady` call. */
interface Waiter {
  readonly module: ModuleId;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

/**
 * Builds the readiness gate over a source port. It subscribes to transitions
 * before it asks for the snapshot (Wails drops events emitted before a
 * listener exists, and the snapshot covers what came earlier). A failed
 * snapshot rejects the current waiters with its error; the next wait asks again.
 * While a waiter waits on a `starting` module the gate re-reads the snapshot
 * with a capped backoff (`READINESS_RESYNC_DELAYS_MS`), in case that module's
 * event was dropped; a failed re-read keeps waiting, and no timer runs when
 * nothing waits. Each module that settles is announced once to `onSettled`.
 */
export function createReadinessGate(source: ReadinessSource): ReadinessGate {
  let state: ReadinessGateState = { modules: new Map(), snapshotLoaded: false };
  let started = false;
  let snapshotInFlight = false;
  let resyncTimer: ReturnType<typeof setTimeout> | undefined;
  let resyncAttempt = 0;
  let resyncInFlight = false;
  const waiters = new Set<Waiter>();
  const settledListeners = new Set<SettledListener>();

  // Once the snapshot loaded, `settleWaiters` settles every waiter whose module is
  // ready, failed or unknown, so any waiter left waits on a `starting` module.
  const waitsOnStartingModule = () => state.snapshotLoaded && waiters.size > 0;

  // Hoisted: the re-sync, the waiters and `apply` call each other.
  function scheduleResync() {
    if (!waitsOnStartingModule()) {
      clearTimeout(resyncTimer);
      resyncTimer = undefined;
      resyncAttempt = 0;
    } else if (resyncTimer === undefined && !resyncInFlight) {
      resyncTimer = setTimeout(resync, resyncDelay(resyncAttempt));
    }
  }

  function resync() {
    resyncTimer = undefined;
    resyncInFlight = true;
    resyncAttempt += 1;
    source.getReadiness().then(
      (snapshot) => {
        resyncInFlight = false;
        apply({ modules: mergeReadinessSnapshot(state.modules, snapshot), snapshotLoaded: true });
      },
      () => {
        resyncInFlight = false;
        scheduleResync();
      },
    );
  }

  function settleWaiters() {
    for (const waiter of [...waiters]) {
      const decision = decideGate(state, waiter.module);
      if (decision.kind === 'run') {
        waiter.resolve();
      } else if (decision.kind === 'fail') {
        waiter.reject(decision.error);
      }
    }
    scheduleResync();
  }

  function apply(next: ReadinessGateState) {
    const settled = newlySettled(state.modules, next.modules);
    state = next;
    settleWaiters();
    settled.forEach((entry) => settledListeners.forEach((listener) => listener(entry)));
  }

  const requestSnapshot = () => {
    if (state.snapshotLoaded || snapshotInFlight) {
      return;
    }
    snapshotInFlight = true;
    source.getReadiness().then(
      (snapshot) => {
        // snapshotInFlight stays set: once loaded, requestSnapshot never asks again.
        apply({ modules: mergeReadinessSnapshot(state.modules, snapshot), snapshotLoaded: true });
      },
      (error: unknown) => {
        snapshotInFlight = false;
        [...waiters].forEach((waiter) => waiter.reject(error));
      },
    );
  };

  const start = () => {
    if (!started) {
      started = true;
      source.subscribe((entry) => apply({ ...state, modules: mergeModuleReadiness(state.modules, entry) }));
    }
    requestSnapshot();
  };

  const whenReady = (module: ModuleId, signal?: AbortSignal) => {
    start();
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const onAbort = (event: Event) => waiter.reject((event.target as AbortSignal).reason);
      const finish = <T>(settle: (value: T) => void) => (value: T) => {
        waiters.delete(waiter);
        signal?.removeEventListener('abort', onAbort);
        settle(value);
        scheduleResync();
      };
      const waiter: Waiter = { module, resolve: finish(resolve), reject: finish(reject) };
      waiters.add(waiter);
      signal?.addEventListener('abort', onAbort);
      settleWaiters();
    });
  };

  const onSettled = (listener: SettledListener) => {
    settledListeners.add(listener);
    return () => {
      settledListeners.delete(listener);
    };
  };

  return { start, whenReady, onSettled };
}

/**
 * Runs a query's binding call behind the gate: at once when the query names no
 * module, after the module is ready otherwise. A gated query with no gate
 * (no `BridgeQueryProvider` above it) fails as `internal` without calling.
 */
export async function runGatedQuery<T>(
  gate: ReadinessGate | null,
  module: ModuleId | undefined,
  run: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (module !== undefined) {
    if (gate === null) {
      throw createBridgeError('internal', `a query for ${module} needs a BridgeQueryProvider readiness gate`);
    }
    await gate.whenReady(module, signal);
  }

  return run();
}
