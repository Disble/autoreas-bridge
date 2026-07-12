import type { ObservabilityLogEntry } from '../../../../shared/contracts/observability.types';

export type { ObservabilityLogEntry };

/** Presentation-ready shape of a log entry, with derived labels for rendering. */
export interface ObservabilityPanelViewModel {
  readonly entry: ObservabilityLogEntry;
  readonly durationLabel: string | null;
  readonly metadataEntries: ReadonlyArray<readonly [string, string]>;
  readonly summaryLabels: ReadonlyArray<string>;
}
