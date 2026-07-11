import type { ObservabilityLogEntry } from '../../../../shared/contracts/observability.types';
import type { NetworkDetailViewModel } from './network-panel.types';

/**
 * Selected-entry payload consumed by the Network panel hook.
 */
export interface NetworkPanelSelection {
  readonly selectedEntry: ObservabilityLogEntry | null;
  readonly selectedDetail: NetworkDetailViewModel | null;
}

/**
 * Status-bar counters derived for the Network panel.
 */
export interface NetworkPanelSummary {
  readonly entryCount: number;
  readonly errorCount: number;
  readonly shownCount: number;
}
