import type { ModuleReadiness, ReadinessSource } from '../../contracts/readiness.types';

/**
 * Shorthand for one module's readiness, as `GetReadiness()` or a
 * `bridge.readiness` event reports it.
 * @param module The module id.
 * @param state Its lifecycle state.
 * @param reason The failure reason, only for `failed`.
 * @returns The readiness entry.
 */
export function status(module: string, state: ModuleReadiness['state'], reason?: string): ModuleReadiness {
  return reason === undefined ? { module, state } : { module, state, reason };
}

/**
 * A controllable readiness source for tests: `emit` pushes a transition,
 * `answer` and `fail` settle the oldest pending `getReadiness()` call, and
 * `calls` records the order of `subscribe` and `getReadiness`.
 * @returns The source and its controls.
 */
export function fakeSource() {
  const calls: string[] = [];
  const listeners = new Set<(entry: ModuleReadiness) => void>();
  const pending: { resolve: (snapshot: readonly ModuleReadiness[]) => void; reject: (error: unknown) => void }[] = [];
  const source: ReadinessSource = {
    getReadiness: () => {
      calls.push('getReadiness');
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
    subscribe: (listener) => {
      calls.push('subscribe');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    source,
    calls,
    emit: (entry: ModuleReadiness) => listeners.forEach((listener) => listener(entry)),
    answer: async (...snapshot: ModuleReadiness[]) => {
      pending.shift()?.resolve(snapshot);
      await Promise.resolve();
    },
    fail: async (error: unknown) => {
      pending.shift()?.reject(error);
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

/**
 * A readiness source whose every `getReadiness()` answers the same snapshot at
 * once; `emit` pushes a later transition. For component tests that only need
 * a module in one state.
 * @param snapshot The modules every snapshot read answers.
 * @returns The source and its `emit` control.
 */
export function staticSource(...snapshot: ModuleReadiness[]) {
  const listeners = new Set<(entry: ModuleReadiness) => void>();
  const source: ReadinessSource = {
    getReadiness: () => Promise.resolve(snapshot),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return { source, emit: (entry: ModuleReadiness) => listeners.forEach((listener) => listener(entry)) };
}

/**
 * Records how a promise settled, without awaiting it.
 * @param promise The promise to watch.
 * @returns An object whose `settled` (and `error`) update as it settles.
 */
export function track(promise: Promise<unknown>) {
  const outcome: { settled: 'pending' | 'resolved' | 'rejected'; error?: unknown } = { settled: 'pending' };
  promise.then(
    () => (outcome.settled = 'resolved'),
    (error: unknown) => Object.assign(outcome, { settled: 'rejected', error }),
  );
  return outcome;
}

/** Lets queued promise callbacks run (four microtask turns). */
export async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
