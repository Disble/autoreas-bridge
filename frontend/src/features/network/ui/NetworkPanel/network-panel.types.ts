import type { UIEvent } from 'react';
import type { RuntimeEventSource } from '../../../../infrastructure/runtime-event-source/runtime-event-source.types';
import type {
  EventFeedState,
  NetworkDomainOption,
  NetworkLevelFilter,
  RuntimeEventRow,
} from '../../../../shared/store/network-store/network-store.types';

export type { EventFeedState, NetworkLevelFilter, RuntimeEventRow };

/** The filter set the feed applies to both the persisted page and the live overlay. */
export interface EventFeedFilters {
  readonly query: string;
  readonly level: NetworkLevelFilter;
  readonly domain: string;
}

/**
 * The only thing the window reconciliation reads off a row: its stable
 * identity. Typing the input this loosely is what lets the Transactions rail
 * reuse the same reconciliation rather than reimplement them — a capture push
 * is a head insertion exactly like a runtime-event push, and a second copy of
 * these rules is a second place for the `prependedCount` term to go missing.
 */
export interface WindowedRowIdentity {
  readonly id: string;
}

/**
 * Inputs for one live-feed window reconciliation pass.
 *
 * `prependedCount` is what separates this rail from every static one: rows
 * enter at the HEAD, so each admitted push shifts every rendered row down one
 * index. Holding the count constant would silently drop the bottom visible row
 * on every single event (design §4.1).
 */
export interface EventWindowInput {
  readonly currentVisibleCount: number;
  readonly previousTotal: number;
  readonly nextRows: readonly WindowedRowIdentity[];
  readonly selectedId: string | null;
  /** Rows admitted at the head since the last pass; 0 for a tail append. */
  readonly prependedCount: number;
  /**
   * Rows rendered before the first growth, and the floor the window never
   * drops below. Passed in rather than read from a module constant because
   * each rail's batch is its own page size.
   */
  readonly initialCount: number;
}

/** Inputs for one overlay admission decision against the persisted page's head. */
export interface OverlayAdmissionInput {
  readonly entry: RuntimeEventRow;
  /** `occurredAtMs` of the newest persisted row, or null before a first page loads. */
  readonly head: number | null;
  /** The persisted rows sharing the head millisecond, for fingerprint reconciliation. */
  readonly headRows: readonly RuntimeEventRow[];
  readonly filters: EventFeedFilters;
}

/** Active tab in the DevTools-style detail inspector. */
export type NetworkDetailTab = 'general' | 'metadata' | 'trace';

/**
 * Props for the top-level NetworkPanel container. `source` is the persisted
 * runtime-event read seam; it defaults to the shared singleton and tests
 * inject a fake.
 */
export interface NetworkPanelProps {
  readonly source?: RuntimeEventSource;
}

/** HeroUI Chip color tokens supported by the project's design system. */
export type HeroChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/** Presentation-ready shape of a single Network row, one per persisted or overlaid event. */
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

/**
 * Presentation-ready shape of the selected event's detail inspector.
 *
 * `hasCorrelation` is carried separately from `traceEntries` because the two
 * empty cases mean different things: no correlation id at all is a property of
 * the event, while an empty sibling list under a real correlation id is a
 * measured result. Collapsing them would render "siblings were lost" for an
 * event that never had any.
 */
export interface NetworkDetailViewModel {
  readonly entry: RuntimeEventRow;
  readonly timeLabel: string;
  readonly domain: string;
  readonly level: string;
  readonly message: string;
  readonly hasCorrelation: boolean;
  readonly fields: ReadonlyArray<readonly [string, string]>;
  readonly metadataEntries: ReadonlyArray<readonly [string, string]>;
  readonly traceEntries: readonly NetworkTraceEntryViewModel[];
}

/** Props for the dumb NetworkTable presentational component. */
export interface NetworkTableProps {
  readonly rows: readonly NetworkEntryViewModel[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
  /** Copy rendered in place of the rows: loading, empty, or the degraded reason. */
  readonly emptyMessage: string;
}

/** Props for the dumb NetworkFilterBar presentational component. */
export interface NetworkFilterBarProps {
  readonly query: string;
  readonly levelFilter: NetworkLevelFilter;
  readonly domainFilter: string;
  /** Derived from the unfiltered summary aggregate, never a hardcoded list (design D-5). */
  readonly domainOptions: readonly NetworkDomainFilterOption[];
  readonly onQueryChange: (query: string) => void;
  readonly onLevelFilterChange: (levelFilter: NetworkLevelFilter) => void;
  readonly onDomainFilterChange: (domainFilter: string) => void;
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

/**
 * A domain-filter pill option. Derived, never enumerated: the options come
 * from the unfiltered summary aggregate through `toDomainFilterOptions`, so a
 * domain present in the store is always offerable (design D-5).
 */
export type NetworkDomainFilterOption = NetworkDomainOption;
