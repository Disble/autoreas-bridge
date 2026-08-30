import type { NetworkDetailViewModel, RuntimeEventRow } from './network-panel.types';

/**
 * Selected-event payload consumed by the Network panel hook.
 */
export interface NetworkPanelSelection {
  readonly selectedEntry: RuntimeEventRow | null;
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
