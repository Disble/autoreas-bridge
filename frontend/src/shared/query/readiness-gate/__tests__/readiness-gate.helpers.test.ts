import { describe, expect, it, vi } from 'vitest';

import type { ModuleReadiness, ReadinessSource } from '../../../contracts/readiness.types';
import { createBridgeError } from '../../bridge-error/bridge-error.helpers';
import { createReadinessGate, decideGate, mergeModuleReadiness, mergeReadinessSnapshot, runGatedQuery } from '../readiness-gate.helpers';

/** Shorthand for one module's readiness. */
function status(module: string, state: ModuleReadiness['state'], reason?: string): ModuleReadiness {
  return reason === undefined ? { module, state } : { module, state, reason };
}

/** A map holding the given statuses, keyed by module. */
function modulesOf(...statuses: ModuleReadiness[]): ReadonlyMap<string, ModuleReadiness> {
  return new Map(statuses.map((entry) => [entry.module, entry]));
}

/**
 * A controllable readiness source: `emit` pushes a transition, `answer` and
 * `fail` settle the pending `getReadiness()` call, `calls` records the order.
 */
function fakeSource() {
  const calls: string[] = [];
  const listeners = new Set<(status: ModuleReadiness) => void>();
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

/** Records how a promise settled, without awaiting it. */
function track(promise: Promise<unknown>) {
  const outcome: { settled: 'pending' | 'resolved' | 'rejected'; error?: unknown } = { settled: 'pending' };
  promise.then(
    () => (outcome.settled = 'resolved'),
    (error: unknown) => Object.assign(outcome, { settled: 'rejected', error }),
  );
  return outcome;
}

/** Lets queued promise callbacks run. */
async function flush() {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }
}

describe('mergeModuleReadiness', () => {
  it.each([
    ['starting → ready', status('episodes', 'starting'), status('episodes', 'ready'), 'ready'],
    ['starting → failed', status('episodes', 'starting'), status('episodes', 'failed', 'db'), 'failed'],
    ['ready stays ready on a stale starting', status('episodes', 'ready'), status('episodes', 'starting'), 'ready'],
    ['failed stays failed on a stale starting', status('episodes', 'failed', 'db'), status('episodes', 'starting'), 'failed'],
    ['ready never turns failed', status('episodes', 'ready'), status('episodes', 'failed', 'db'), 'ready'],
    ['failed never turns ready', status('episodes', 'failed', 'db'), status('episodes', 'ready'), 'failed'],
  ])('%s', (_label, current, incoming, expected) => {
    const merged = mergeModuleReadiness(modulesOf(current), incoming);

    expect(merged.get('episodes')?.state).toBe(expected);
  });

  it('adds an unknown module and leaves the input map untouched', () => {
    const current = modulesOf(status('anime', 'ready'));
    const merged = mergeModuleReadiness(current, status('episodes', 'starting'));

    expect([...merged.values()]).toEqual([status('anime', 'ready'), status('episodes', 'starting')]);
    expect(current.has('episodes')).toBe(false);
  });
});

describe('mergeReadinessSnapshot', () => {
  it('folds every entry and keeps a terminal state an older snapshot contradicts', () => {
    const merged = mergeReadinessSnapshot(modulesOf(status('episodes', 'ready')), [
      status('episodes', 'starting'),
      status('anime', 'failed', 'anime: boom'),
    ]);

    expect(merged.get('episodes')?.state).toBe('ready');
    expect(merged.get('anime')).toEqual(status('anime', 'failed', 'anime: boom'));
  });
});

describe('decideGate', () => {
  it.each([
    ['ready runs', modulesOf(status('episodes', 'ready')), false, { kind: 'run' }],
    ['starting waits', modulesOf(status('episodes', 'starting')), true, { kind: 'wait' }],
    ['unknown before the snapshot waits', modulesOf(), false, { kind: 'wait' }],
  ])('%s', (_label, modules, snapshotLoaded, expected) => {
    expect(decideGate({ modules, snapshotLoaded }, 'episodes')).toEqual(expected);
  });

  it('fails a failed module with failed_precondition carrying its reason', () => {
    const decision = decideGate({ modules: modulesOf(status('episodes', 'failed', 'episodes: db closed')), snapshotLoaded: true }, 'episodes');

    expect(decision).toMatchObject({ kind: 'fail', error: { name: 'BridgeError', code: 'failed_precondition', message: 'episodes: db closed' } });
  });

  it('names the module when a failed one carries no reason', () => {
    const decision = decideGate({ modules: modulesOf(status('episodes', 'failed')), snapshotLoaded: true }, 'episodes');

    expect(decision).toMatchObject({ kind: 'fail', error: { code: 'failed_precondition', message: 'episodes failed to start' } });
  });

  it('fails a module the loaded snapshot does not register as internal', () => {
    const decision = decideGate({ modules: modulesOf(status('anime', 'ready')), snapshotLoaded: true }, 'episodes');

    expect(decision).toMatchObject({ kind: 'fail', error: { code: 'internal', message: 'episodes is not a registered module' } });
  });
});

describe('createReadinessGate', () => {
  it('subscribes before it asks for the snapshot, once however often it starts', () => {
    const fake = fakeSource();
    const gate = createReadinessGate(fake.source);

    gate.start();
    gate.start();
    void gate.whenReady('episodes');

    expect(fake.calls).toEqual(['subscribe', 'getReadiness']);
  });

  it('keeps a starting module pending and resolves it on its ready event', async () => {
    const fake = fakeSource();
    const outcome = track(createReadinessGate(fake.source).whenReady('episodes'));

    await fake.answer(status('episodes', 'starting'));
    await flush();
    expect(outcome.settled).toBe('pending');

    fake.emit(status('episodes', 'ready'));
    await flush();
    expect(outcome.settled).toBe('resolved');
  });

  it('rejects a waiting module with failed_precondition on its failed event', async () => {
    const fake = fakeSource();
    const outcome = track(createReadinessGate(fake.source).whenReady('episodes'));

    fake.emit(status('episodes', 'failed', 'episodes: db closed'));
    await flush();

    expect(outcome).toMatchObject({ settled: 'rejected', error: { code: 'failed_precondition', message: 'episodes: db closed' } });
  });

  it('keeps a ready event when the snapshot answers a stale starting', async () => {
    const fake = fakeSource();
    const gate = createReadinessGate(fake.source);
    gate.start();

    fake.emit(status('episodes', 'ready'));
    await fake.answer(status('episodes', 'starting'));

    await expect(gate.whenReady('episodes')).resolves.toBeUndefined();
  });

  it('answers a module already settled without waiting for anything', async () => {
    const fake = fakeSource();
    const gate = createReadinessGate(fake.source);
    gate.start();
    await fake.answer(status('episodes', 'ready'), status('anime', 'failed', 'anime: boom'));

    await expect(gate.whenReady('episodes')).resolves.toBeUndefined();
    await expect(gate.whenReady('anime')).rejects.toMatchObject({ code: 'failed_precondition', message: 'anime: boom' });
    expect(fake.calls).toEqual(['subscribe', 'getReadiness']);
  });

  it('fails a wait for a module the snapshot does not register', async () => {
    const fake = fakeSource();
    const outcome = track(createReadinessGate(fake.source).whenReady('episodes'));

    await fake.answer(status('anime', 'ready'));
    await flush();

    expect(outcome).toMatchObject({ settled: 'rejected', error: { code: 'internal' } });
  });

  it('rejects waiters with the snapshot failure and asks again on the next wait', async () => {
    const fake = fakeSource();
    const gate = createReadinessGate(fake.source);
    const first = track(gate.whenReady('episodes'));

    await fake.fail(createBridgeError('unavailable', 'GetReadiness is not attached'));
    await flush();
    expect(first).toMatchObject({ settled: 'rejected', error: { code: 'unavailable' } });

    const second = track(gate.whenReady('episodes'));
    await fake.answer(status('episodes', 'ready'));
    await flush();
    expect(second.settled).toBe('resolved');
    expect(fake.calls).toEqual(['subscribe', 'getReadiness', 'getReadiness']);
  });

  it('asks for the snapshot only once while one is in flight', () => {
    const fake = fakeSource();
    const gate = createReadinessGate(fake.source);

    void gate.whenReady('episodes');
    void gate.whenReady('anime');

    expect(fake.calls).toEqual(['subscribe', 'getReadiness']);
  });

  it('rejects with the abort reason and stops waiting when the signal aborts', async () => {
    const fake = fakeSource();
    const controller = new AbortController();
    const outcome = track(createReadinessGate(fake.source).whenReady('episodes', controller.signal));

    controller.abort('unmounted');
    await flush();
    expect(outcome).toMatchObject({ settled: 'rejected', error: 'unmounted' });

    fake.emit(status('episodes', 'ready'));
    await flush();
    expect(outcome.error).toBe('unmounted');
  });

  it('rejects at once when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort('gone');

    await expect(createReadinessGate(fakeSource().source).whenReady('episodes', controller.signal)).rejects.toBe('gone');
  });
});

describe('runGatedQuery', () => {
  it('runs at once when the query names no module', async () => {
    const gate = { start: vi.fn(), whenReady: vi.fn() };

    await expect(runGatedQuery(gate, undefined, () => Promise.resolve('rows'))).resolves.toBe('rows');
    expect(gate.whenReady).not.toHaveBeenCalled();
  });

  it('calls the binding only after the module is ready', async () => {
    const fake = fakeSource();
    const run = vi.fn(() => Promise.resolve('rows'));
    const controller = new AbortController();
    const result = runGatedQuery(createReadinessGate(fake.source), 'episodes', run, controller.signal);

    await fake.answer(status('episodes', 'starting'));
    await flush();
    expect(run).not.toHaveBeenCalled();

    fake.emit(status('episodes', 'ready'));
    await expect(result).resolves.toBe('rows');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never calls the binding when the module failed', async () => {
    const fake = fakeSource();
    const run = vi.fn(() => Promise.resolve('rows'));
    const result = runGatedQuery(createReadinessGate(fake.source), 'episodes', run);

    fake.emit(status('episodes', 'failed', 'episodes: db closed'));

    await expect(result).rejects.toMatchObject({ code: 'failed_precondition' });
    expect(run).not.toHaveBeenCalled();
  });

  it('fails a gated query with internal when no gate is provided', async () => {
    const run = vi.fn(() => Promise.resolve('rows'));

    await expect(runGatedQuery(null, 'episodes', run)).rejects.toMatchObject({ code: 'internal', message: expect.stringMatching(/\S/) });
    expect(run).not.toHaveBeenCalled();
  });
});
