export type ObservabilityPanelProps = Record<string, never>;

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

export interface ObservabilityPanelViewModel {
  readonly entry: ObservabilityLogEntry;
  readonly durationLabel: string | null;
  readonly metadataEntries: ReadonlyArray<readonly [string, string]>;
  readonly summaryLabels: ReadonlyArray<string>;
}
