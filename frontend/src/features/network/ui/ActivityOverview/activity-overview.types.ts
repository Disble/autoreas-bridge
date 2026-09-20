import type { ReactNode } from 'react';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { RuntimeEventSource } from '../../../../infrastructure/runtime-event-source/runtime-event-source.types';

/**
 * Props for the top-level ActivityOverview container. Both read seams default
 * to their shared singletons; tests inject fakes. The surface is read-only by
 * construction — it has no writer to inject.
 */
export interface ActivityOverviewProps {
  readonly captureSource?: CaptureTransactionSource;
  readonly eventSource?: RuntimeEventSource;
  /**
   * Opaque status strip composed by the app layer (`ActivityRoute` renders the
   * bridge status card there), rendered above the aggregation content. This is
   * where the card lives now — the product owner's information-architecture
   * decision places bridge storage status inside Overview, the tab that
   * answers "what is the bridge doing" — so `/activity/runtime-events` no
   * longer shows it. The component treats the strip as presentation-only: it
   * never inspects it, and absence renders nothing, so every other caller of
   * this tab keeps working unchanged.
   */
  readonly statusStrip?: ReactNode;
}

/** One bounded recent-error reference rendered under a request-health group. */
export interface RequestErrorSampleViewModel {
  readonly requestId: string;
  readonly timeLabel: string;
  readonly errorCode: string;
}

/**
 * Presentation-ready shape of one (route, status, outcome) request-health row.
 *
 * `statusLabel` is a label and never a number, because a group can legitimately
 * carry no HTTP status at all — the websocket transport never produces one.
 */
export interface RequestHealthRowViewModel {
  readonly id: string;
  readonly route: string;
  readonly statusLabel: string;
  readonly outcome: string;
  readonly count: number;
  readonly errorSamples: readonly RequestErrorSampleViewModel[];
}

/** One count bucket inside a runtime-event grouping dimension. */
export interface EventCountRowViewModel {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  /** Share of this bucket within its OWN dimension, e.g. `98.4%`. */
  readonly shareLabel: string;
}

/** Identifier of one of the three independent runtime-event groupings. */
export type EventSummarySectionId = 'domain' | 'level' | 'eventType';

/**
 * One named runtime-event grouping. The three dimensions are independent
 * aggregations over the same matched set, so their counts are not additive
 * across sections and each row's share is computed inside its own dimension.
 */
export interface EventSummarySectionViewModel {
  readonly id: EventSummarySectionId;
  readonly title: string;
  readonly rows: readonly EventCountRowViewModel[];
}

/** Presentation-ready shape of one newest-matching runtime-event sample line. */
export interface EventSampleRowViewModel {
  readonly id: string;
  readonly timeLabel: string;
  readonly domain: string;
  readonly level: string;
  readonly message: string;
}

/**
 * Props for the captured-request health card: the header, the degraded
 * disclosure and the (route, status, outcome) count table. All values are
 * projected by `useActivityOverview` and passed down; the card only renders.
 */
export interface ActivityOverviewRequestHealthCardProps {
  /** Whether the two aggregations have not resolved yet; swaps in skeleton rows. */
  readonly isLoading: boolean;
  /** Presentation-ready request-health rows, one per route/status/outcome group. */
  readonly requestRows: readonly RequestHealthRowViewModel[];
  /** Total captured requests across all groups, shown in the card description. */
  readonly requestCount: number;
  /** Degraded-store disclosure, or `null` on a healthy read. */
  readonly requestStatusMessage: string | null;
  /** Empty-state copy shown by the table when a healthy read matched nothing. */
  readonly requestEmptyMessage: string;
}

/**
 * Props for the persisted runtime-event summary card: the header, the degraded
 * disclosure, the three grouping sections and the newest-samples list. All
 * values are projected by `useActivityOverview` and passed down; the card only
 * renders.
 */
export interface ActivityOverviewEventSummaryCardProps {
  /** Whether the two aggregations have not resolved yet; swaps in skeleton rows. */
  readonly isLoading: boolean;
  /** The three independent runtime-event grouping sections with their rows. */
  readonly eventSections: readonly EventSummarySectionViewModel[];
  /** Bounded newest-matching runtime-event samples for the samples list. */
  readonly eventSamples: readonly EventSampleRowViewModel[];
  /** Degraded-store disclosure, or `null` on a healthy read. */
  readonly eventStatusMessage: string | null;
  /** Empty-state copy shown by the grouping tables when a healthy read matched nothing. */
  readonly eventEmptyMessage: string;
}

/**
 * Props for `buildActivityOverviewSkeletonRows`, the placeholder builder
 * shared by the request-health and event-summary tables. Both are plain count
 * tables that differ only in column count and width, so one builder covers
 * both rather than duplicating the same row markup per table.
 */
export interface ActivityOverviewSkeletonRowsProps {
  readonly rowCount: number;
  readonly columnWidths: readonly string[];
  /** `data-testid` stamped on every placeholder row, distinguishing which table it belongs to. */
  readonly testId: string;
  /**
   * Prefix for each placeholder row's `id`, kept separate from `testId` so
   * three simultaneously loading event-summary tables never render the same
   * DOM id: `testId` stays constant for the assertion, `idPrefix` carries the
   * per-table identity.
   */
  readonly idPrefix: string;
}
