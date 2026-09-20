/** One canonical read capability the desktop adapter intentionally does not expose, with its mechanical reason. */
export interface ObservabilityFactsExcludedCapability {
  /** Canonical capability name, matching the readcap catalog. */
  readonly name: string;
  /** The mechanical reason registered for the capability's absence. */
  readonly reason: string;
}

/**
 * The desktop adapter's parity statement over the canonical observability
 * read catalog: which capabilities it exposes, which it excludes and why, and
 * the catalog total the two lists partition.
 */
export interface ObservabilityFactsParity {
  /** Capability names the adapter exposes. Never null on the wire. */
  readonly exposedCapabilities: readonly string[];
  /** Capabilities the adapter excludes, each with its registered reason. Never null on the wire. */
  readonly excludedCapabilities: readonly ObservabilityFactsExcludedCapability[];
  /** Total number of capabilities in the canonical catalog the two lists partition. */
  readonly catalogTotal: number;
}

/** Each observability store's retention limit as reported by its owning Go package. */
export interface ObservabilityFactsRetention {
  /** Row cap enforced by pruning on the captured-request store. */
  readonly captureRows: number;
  /** Row cap enforced by pruning on the persisted runtime-event store. */
  readonly eventRows: number;
  /** Row cap enforced by pruning on the device sync diagnostics store. */
  readonly syncDiagnosticRows: number;
}

/** The `GetObservabilityFacts` result envelope: parity facts, retention limits, and sample caps. */
export interface ObservabilityFacts {
  /** Parity statement over the canonical read catalog. */
  readonly parity: ObservabilityFactsParity;
  /** Retention limits of the three observability stores. */
  readonly retention: ObservabilityFactsRetention;
  /** Bounded sample size of each summary, as reported by its owning package. */
  readonly sampleCaps: ObservabilitySampleCaps;
  /** True when the adapter's observability read path was unwired and every block is zeroed. */
  readonly degraded: boolean;
}

/** Each summary's bounded sample size as reported by its owning Go package. */
export interface ObservabilitySampleCaps {
  /** Newest-events sample cap of the runtime-event summary, behind the Overview's "Newest events" list. */
  readonly eventSamples: number;
  /** Per-group latest-error sample cap of the captured-request summary, behind the request-health "Latest errors" column. */
  readonly captureErrorSamples: number;
}
