import type { ObservabilityFacts } from '../../../../../infrastructure/observability-facts-source/observability-facts-source.types';

/**
 * Fixtures shared by the observability-facts tests: the payload the binding
 * reports for the current manifest, its degraded twin, and a second-exclusion
 * variant. Extracted so the rendering and loader suites drive the same shapes
 * instead of copying literals.
 */

/** Builds the facts payload the binding reports for the current manifest, overridable per test. */
export function factsFixture(overrides: Partial<ObservabilityFacts> = {}): ObservabilityFacts {
  return {
    parity: {
      exposedCapabilities: [
        'search_requests',
        'resolve_request_context',
        'get_request_context',
        'summary_requests',
        'search_events',
        'summary_events',
        'list_device_sync_diagnostics',
      ],
      excludedCapabilities: [
        {
          name: 'get_correlation_timeline',
          reason:
            'The merged request+event timeline is excluded because the two stores are keyed on different values, so its request side would render empty by construction.',
        },
      ],
      catalogTotal: 8,
    },
    retention: { captureRows: 5000, eventRows: 20000, syncDiagnosticRows: 5000 },
    sampleCaps: { eventSamples: 5, captureErrorSamples: 5 },
    degraded: false,
    ...overrides,
  };
}

/** Builds the zeroed facts payload the binding reports for an unwired adapter. */
export function degradedFactsFixture(): ObservabilityFacts {
  return {
    parity: { exposedCapabilities: [], excludedCapabilities: [], catalogTotal: 0 },
    retention: { captureRows: 0, eventRows: 0, syncDiagnosticRows: 0 },
    sampleCaps: { eventSamples: 0, captureErrorSamples: 0 },
    degraded: true,
  };
}
