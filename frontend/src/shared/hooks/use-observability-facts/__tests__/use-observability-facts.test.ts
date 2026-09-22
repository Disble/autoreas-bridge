import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilityFacts } from '../../../../infrastructure/observability-facts-source/observability-facts-source.types';
import type { ObservabilityFactsLoader } from '../use-observability-facts.types';
import { useObservabilityFacts } from '../use-observability-facts';

/**
 * Hook tests for the shared observability-facts reader: the real hook over the
 * real loader and the real binding seam, with only `window.go` stubbed. The
 * fixtures here are deliberately minimal and local — the shared hook must not
 * import test support from a feature folder, and the hook only observes null
 * versus a resolved payload, not the payload's shape.
 */

/** Builds a minimal healthy facts payload the binding can resolve. */
function factsFixture(): ObservabilityFacts {
  return {
    parity: { exposedCapabilities: ['search_events'], excludedCapabilities: [], catalogTotal: 1 },
    retention: { captureRows: 1, eventRows: 2, syncDiagnosticRows: 3 },
    sampleCaps: { eventSamples: 4, captureErrorSamples: 5 },
    degraded: false,
  };
}

/** Builds a minimal facts payload whose adapter reports itself degraded. */
function degradedFactsFixture(): ObservabilityFacts {
  return {
    parity: { exposedCapabilities: [], excludedCapabilities: [], catalogTotal: 0 },
    retention: { captureRows: 0, eventRows: 0, syncDiagnosticRows: 0 },
    sampleCaps: { eventSamples: 0, captureErrorSamples: 0 },
    degraded: true,
  };
}

/**
 * Wires a `window.go` binding whose `GetObservabilityFacts` returns a promise
 * resolved manually through the returned callback, so a test controls exactly
 * when the read lands relative to renders and unmounts.
 * @returns The facts payload's manual resolve callback.
 */
function wireDeferredFactsBinding(): (facts: ObservabilityFacts) => void {
  let resolveFacts!: (facts: ObservabilityFacts) => void;
  // The deferred promise is built eagerly: the binding only invokes it after
  // its async readiness poll, so the resolve callback must exist before then.
  const pendingFacts = new Promise<ObservabilityFacts>((resolve) => {
    resolveFacts = resolve;
  });
  window.go = { desktop: { App: { GetObservabilityFacts: () => pendingFacts } } };
  return (facts: ObservabilityFacts) => resolveFacts(facts);
}

describe('useObservabilityFacts', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'go');
  });

  it('holds null while the read is in flight and exposes the resolved payload once it lands', async () => {
    const resolveFacts = wireDeferredFactsBinding();
    const { result } = renderHook(() => useObservabilityFacts());

    expect(result.current).toBeNull();

    resolveFacts(factsFixture());
    await waitFor(() => expect(result.current).toEqual(factsFixture()));
  });

  it('holds null when the loader degrades a degraded adapter report', async () => {
    const getFacts = vi.fn().mockResolvedValue(degradedFactsFixture());
    window.go = { desktop: { App: { GetObservabilityFacts: getFacts } } };
    const { result } = renderHook(() => useObservabilityFacts());

    // The read must actually land: a hook that never read would also hold
    // null, and that would pass this test for the wrong reason.
    await waitFor(() => expect(getFacts).toHaveBeenCalledTimes(1));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(result.current).toBeNull();
  });

  it('reads the binding exactly once per mount, across rerenders, and reloads when the injected loader changes', async () => {
    const getFacts = vi.fn().mockResolvedValue(factsFixture());
    window.go = { desktop: { App: { GetObservabilityFacts: getFacts } } };
    // Undefined defers to the shared default loader; assigning a different
    // seam between rerenders varies the hook's real effect dependency.
    let injectedLoader: ObservabilityFactsLoader | undefined;
    const { result, rerender } = renderHook(() => useObservabilityFacts(injectedLoader));

    await waitFor(() => expect(result.current).toEqual(factsFixture()));
    rerender();
    await waitFor(() => expect(getFacts).toHaveBeenCalledTimes(1));

    // A different injected loader is a real effect dependency: the hook must
    // reload through it. Under a literal dependency array the effect never
    // re-runs and this row fails.
    const alternateLoader = vi.fn().mockResolvedValue(degradedFactsFixture());
    injectedLoader = alternateLoader;
    rerender();

    await waitFor(() => expect(alternateLoader).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).toEqual(degradedFactsFixture()));
    expect(getFacts).toHaveBeenCalledTimes(1);
  });

  it('resolving after unmount neither warns nor throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resolveFacts = wireDeferredFactsBinding();
    const { unmount } = renderHook(() => useObservabilityFacts());

    unmount();
    resolveFacts(factsFixture());
    // Flush the resolution without act: any React warning about the update
    // would surface through the console.error spy, not through state.
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
