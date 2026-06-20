/** Props for the ObservabilityPanel view. It sources its data from its own hook. */
export type ObservabilityPanelProps = Record<string, never>;

/** A single structured runtime log entry streamed from the backend. */
export interface ObservabilityLogEntry {
  readonly timestamp: string;
  readonly domain: string;
  readonly level?: string;
  readonly message: string;
  readonly correlationId?: string;
  readonly entityId?: string;
  readonly eventType?: string;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Presentation-ready shape of a log entry, with derived labels for rendering. */
export interface ObservabilityPanelViewModel {
  readonly entry: ObservabilityLogEntry;
  readonly durationLabel: string | null;
  readonly metadataEntries: ReadonlyArray<readonly [string, string]>;
  readonly summaryLabels: ReadonlyArray<string>;
}
