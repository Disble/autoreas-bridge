import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toModuleReadiness } from '../readiness-source.helpers';

describe('toModuleReadiness', () => {
  it.each([
    ['a starting module', { module: 'episodes', state: 'starting' }, { module: 'episodes', state: 'starting' }],
    ['a ready module', { module: 'anime', state: 'ready', reason: '' }, { module: 'anime', state: 'ready' }],
    ['a failed module with its reason', { module: 'api', state: 'failed', reason: 'api: bind' }, { module: 'api', state: 'failed', reason: 'api: bind' }],
    ['an unknown state', { module: 'api', state: 'paused' }, null],
    ['a module that is not a string', { module: 7, state: 'ready' }, null],
    ['an empty module name', { module: '', state: 'ready' }, null],
    ['a reason that is not a string', { module: 'api', state: 'failed', reason: 3 }, { module: 'api', state: 'failed' }],
    ['null', null, null],
    ['a string', 'ready', null],
  ])('%s', (_label, wire, expected) => {
    expect(toModuleReadiness(wire)).toEqual(expected);
  });
});

describe('createReadinessSource', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  /** Attaches a fake Wails runtime and GetReadiness binding; `calls` records their order. */
  function attachWails(getReadiness: () => Promise<unknown>) {
    const calls: string[] = [];
    const handlers = new Map<string, (payload: unknown) => void>();
    window.runtime = {
      EventsOnMultiple: vi.fn((eventName: string, callback: (payload: unknown) => void) => {
        calls.push(`listen:${eventName}`);
        handlers.set(eventName, callback);
        return () => handlers.delete(eventName);
      }),
    } as never;
    window.go = {
      desktop: {
        App: {
          GetReadiness: vi.fn(() => {
            calls.push('GetReadiness');
            return getReadiness();
          }),
        },
      },
    } as never;
    return { calls, handlers };
  }

  it('maps the snapshot and listens to bridge.readiness before calling GetReadiness', async () => {
    const { createReadinessSource } = await import('../readiness-source.helpers');
    const wails = attachWails(() =>
      Promise.resolve({ modules: [{ module: 'episodes', state: 'starting' }, { module: 'api', state: 'failed', reason: 'api: bind' }] }),
    );
    const source = createReadinessSource();
    const listener = vi.fn();

    source.subscribe(listener);
    const snapshot = source.getReadiness();
    await vi.advanceTimersByTimeAsync(0);

    await expect(snapshot).resolves.toEqual([
      { module: 'episodes', state: 'starting' },
      { module: 'api', state: 'failed', reason: 'api: bind' },
    ]);
    expect(wails.calls).toEqual(['listen:bridge.readiness', 'GetReadiness']);

    wails.handlers.get('bridge.readiness')?.({ module: 'episodes', state: 'ready' });
    wails.handlers.get('bridge.readiness')?.({ module: 'episodes', state: 'bogus' });
    expect(listener.mock.calls).toEqual([[{ module: 'episodes', state: 'ready' }]]);
  });

  it.each([
    ['a coded rejection', () => Promise.reject(new Error('{"code":"internal","message":"registry gone"}')), { code: 'internal', message: 'registry gone' }],
    ['a snapshot with an unreadable entry', () => Promise.resolve({ modules: [{ module: 'episodes', state: 'paused' }] }), { code: 'internal', message: expect.stringMatching(/\S/) }],
    ['a snapshot without modules', () => Promise.resolve({}), { code: 'internal', message: expect.stringMatching(/\S/) }],
    ['a null snapshot', () => Promise.resolve(null), { code: 'internal' }],
  ])('rejects with a BridgeError for %s', async (_label, answer, expected) => {
    const { createReadinessSource } = await import('../readiness-source.helpers');
    attachWails(answer);

    const snapshot = createReadinessSource().getReadiness();
    const assertion = expect(snapshot).rejects.toMatchObject({ name: 'BridgeError', ...expected });
    await vi.advanceTimersByTimeAsync(0);

    await assertion;
  });

  it('rejects as unavailable when the GetReadiness binding never attaches', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../../wails-bindings.helpers');
    const { createReadinessSource } = await import('../readiness-source.helpers');

    const snapshot = createReadinessSource().getReadiness();
    const assertion = expect(snapshot).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: expect.stringMatching(/\S/) });
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await assertion;
  });
});
