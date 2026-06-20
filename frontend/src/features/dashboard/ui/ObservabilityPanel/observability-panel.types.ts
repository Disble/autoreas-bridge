import type { ObservabilityLogEntry } from '../../../../shared/contracts/observability.types';

export type { ObservabilityLogEntry };

/** Props for the ObservabilityPanel view. It sources its data from its own hook. */
export type ObservabilityPanelProps = Record<string, never>;

/** Presentation-ready shape of a log entry, with derived labels for rendering. */
export interface ObservabilityPanelViewModel {
  readonly entry: ObservabilityLogEntry;
  readonly durationLabel: string | null;
  readonly metadataEntries: ReadonlyArray<readonly [string, string]>;
  readonly summaryLabels: ReadonlyArray<string>;
}
