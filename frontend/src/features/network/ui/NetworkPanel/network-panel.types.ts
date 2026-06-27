import type { RefObject } from 'react';
import type { ObservabilityLogSource } from '../../../../infrastructure/observability-log-source';
import type { ObservabilityLogEntry } from '../../../../shared/contracts/observability.types';
import type { EntryWithId } from '../../../../shared/store/network-store.helpers';
import type { NetworkDomainFilter, NetworkLevelFilter } from '../../../../shared/store/network-store.types';

export type { EntryWithId, NetworkDomainFilter, NetworkLevelFilter };

/** Active tab in the DevTools-style detail inspector. */
export type NetworkDetailTab = 'general' | 'metadata' | 'trace';

/**
 * Props for the top-level NetworkPanel container. `source` is optional and
 * defaults to the shared runtime source; tests inject a fake.
 */
export interface NetworkPanelProps {
  readonly source?: ObservabilityLogSource;
}

/** HeroUI Chip color tokens supported by the project's design system. */
export type HeroChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/** Presentation-ready shape of a single Network row, one per raw log entry. */
export interface NetworkEntryViewModel {
  readonly id: string;
  readonly timeLabel: string;
  readonly domain: string;
  readonly level: string;
  readonly message: string;
  readonly statusLabel: string;
  readonly durationLabel: string;
}

/** Presentation-ready shape of a trace sibling line in the detail inspector. */
export interface NetworkTraceEntryViewModel {
  readonly id: string;
  readonly timeLabel: string;
  readonly domain: string;
  readonly message: string;
  readonly isSelected: boolean;
}

/** Presentation-ready shape of the selected entry's detail inspector. */
export interface NetworkDetailViewModel {
  readonly entry: ObservabilityLogEntry;
  readonly timeLabel: string;
  readonly domain: string;
  readonly level: string;
  readonly message: string;
  readonly fields: ReadonlyArray<readonly [string, string]>;
  readonly metadataEntries: ReadonlyArray<readonly [string, string]>;
  readonly traceEntries: readonly NetworkTraceEntryViewModel[];
}

/** Props for the dumb NetworkTable presentational component. */
export interface NetworkTableProps {
  readonly rows: readonly NetworkEntryViewModel[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly isLoading: boolean;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}

/** Props for the dumb NetworkFilterBar presentational component. */
export interface NetworkFilterBarProps {
  readonly query: string;
  readonly levelFilter: NetworkLevelFilter;
  readonly domainFilter: NetworkDomainFilter;
  readonly onQueryChange: (query: string) => void;
  readonly onLevelFilterChange: (levelFilter: NetworkLevelFilter) => void;
  readonly onDomainFilterChange: (domainFilter: NetworkDomainFilter) => void;
}

/** Props for the dumb NetworkDetail presentational component. */
export interface NetworkDetailProps {
  readonly detail: NetworkDetailViewModel | null;
  readonly detailTab: NetworkDetailTab;
  readonly onDetailTabChange: (tab: NetworkDetailTab) => void;
  readonly onClose: () => void;
}

/** A level-filter pill option (`network-panel.constants.ts`). */
export interface NetworkLevelFilterOption {
  readonly value: NetworkLevelFilter;
  readonly label: string;
}

/** A domain-filter pill option (`network-panel.constants.ts`). */
export interface NetworkDomainFilterOption {
  readonly value: NetworkDomainFilter;
  readonly label: string;
}
