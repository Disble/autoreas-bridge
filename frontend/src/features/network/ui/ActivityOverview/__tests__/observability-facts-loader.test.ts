import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadObservabilityFacts } from '../../../../../infrastructure/observability-facts-source/observability-facts-source.helpers';
import { degradedFactsFixture, factsFixture } from './observability-facts.test-support';

/**
 * Loader tests for the observability-facts source: the real module over the
 * real binding seam, with only `window.go` stubbed. The unavailable path
 * waits out the bindings timeout, so these run on fake timers.
 */
describe('loadObservabilityFacts', () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
  });

  it('resolves the payload once the binding attaches', async () => {
    vi.useFakeTimers();
    const pending = loadObservabilityFacts();

    // The binding attaches only after the load started: this proves the wait,
    // not just an already-attached read.
    window.go = { desktop: { App: { GetObservabilityFacts: () => Promise.resolve(factsFixture()) } } } as never;

    await vi.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toEqual(factsFixture());
  });

  it('degrades to null when the binding never attaches', async () => {
    vi.useFakeTimers();

    const pending = loadObservabilityFacts();

    await vi.advanceTimersByTimeAsync(5000);

    // The unavailable sentinel must be exactly null, not merely falsy: the
    // degrade guard normalizes it, and an undefined sentinel would surface as
    // a rejected read here rather than a degraded one.
    await expect(pending).resolves.toBeNull();
  });

  it('degrades to null when the read resolves exactly null', async () => {
    vi.useFakeTimers();
    window.go = {
      desktop: { App: { GetObservabilityFacts: () => Promise.resolve(null) } },
    } as never;

    const pending = loadObservabilityFacts();

    await vi.advanceTimersByTimeAsync(5000);

    // A null payload is a resolved read, so the degrade guard — not the
    // failure catch — must normalize it into the degraded value.
    await expect(pending).resolves.toBeNull();
  });

  it('degrades to null when the binding rejects', async () => {
    vi.useFakeTimers();
    window.go = {
      desktop: { App: { GetObservabilityFacts: () => Promise.reject(new Error('binding gone')) } },
    } as never;

    const pending = loadObservabilityFacts();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toBeNull();
  });

  it('degrades to null when the adapter reports itself degraded', async () => {
    vi.useFakeTimers();
    window.go = {
      desktop: { App: { GetObservabilityFacts: () => Promise.resolve(degradedFactsFixture()) } },
    } as never;

    const pending = loadObservabilityFacts();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toBeNull();
  });
});
