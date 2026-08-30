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
