import type { ObservabilityLogSource } from '../../../../infrastructure/observability-log-source';
import type { NetworkRequestRow, NetworkStatusFilter } from '../../../../shared/store/network-store.types';

export type { NetworkStatusFilter };

/**
 * Props for the top-level NetworkPanel container. `source` is optional and
 * defaults to the shared runtime source; tests inject a fake.
 */
export interface NetworkPanelProps {
  readonly source?: ObservabilityLogSource;
}

/** Visual tone derived from a row's HTTP status, used for status chip coloring. */
export type NetworkRowStatusTone = 'success' | 'warning' | 'danger' | 'pending';

/** HeroUI Chip color tokens supported by the project's design system. */
export type HeroChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/** Presentation-ready shape of a single Network row, with derived labels for rendering. */
export interface NetworkRowViewModel {
  readonly id: string;
  readonly name: string;
  readonly method: string;
  readonly statusLabel: string;
  readonly statusTone: NetworkRowStatusTone;
  readonly type: string;
  readonly durationLabel: string;
}

/** Props for the dumb NetworkTable presentational component. */
export interface NetworkTableProps {
  readonly rows: readonly NetworkRowViewModel[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

/** Props for the dumb NetworkFilterBar presentational component. */
export interface NetworkFilterBarProps {
  readonly query: string;
  readonly statusFilter: NetworkStatusFilter;
  readonly onQueryChange: (query: string) => void;
  readonly onStatusFilterChange: (statusFilter: NetworkStatusFilter) => void;
}

/** Props for the dumb NetworkDetail presentational component. */
export interface NetworkDetailProps {
  readonly row: NetworkRequestRow | null;
}

/** A status-filter dropdown option (`network-panel.constants.ts`). */
export interface NetworkStatusFilterOption {
  readonly value: NetworkStatusFilter;
  readonly label: string;
}
