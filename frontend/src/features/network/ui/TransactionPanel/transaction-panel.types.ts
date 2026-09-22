import type { RefCallback } from 'react';
import type { CaptureRow } from '../../../../shared/contracts/capture.types';
import type { CaptureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { CodeBlockState } from '../../../../shared/ui/CodeBlock/code-block.types';
import type { HeroChipColor } from '../NetworkPanel/network-panel.types';
import type { TransactionDiagnosticsReportViewModel } from '../TransactionDetail/transaction-diagnostics.types';

/** Active tab in the transaction detail inspector. */
export type TransactionDetailTab = 'general' | 'request' | 'response';

/** Presentation-ready shape of one inspectable body/payload pane (request payload or response body). */
export interface TransactionBodyViewModel {
  readonly raw: string;
  readonly state: CodeBlockState;
  readonly notice?: string;
}

/**
 * Discriminated input for `toTransactionBody`: request and response bodies
 * both arrive as optional raw strings. The semantic payload map remains on the
 * DTO for domain/correlation consumers, but raw request-body display must read
 * from the dedicated wire-faithful requestBody field.
 */
export type TransactionBodySource =
  | { readonly kind: 'response'; readonly raw: string | undefined; readonly captureState?: string }
  | { readonly kind: 'request'; readonly raw: string | undefined; readonly captureState?: string };

/**
 * Presentation-ready shape of a single transaction row, in its SETTLED form:
 * every field above `arrivalCapturedAtMs` is the value the row keeps once it is
 * no longer in flight, and none of them depends on the current time.
 */
export interface TransactionRowViewModel {
  readonly id: string;
  readonly methodKind: string;
  readonly route: string;
  readonly outcome: string;
  readonly outcomeColor: HeroChipColor;
  readonly statusLabel: string;
  readonly statusColor: HeroChipColor;
  readonly hasHttpStatus: boolean;
  readonly durationLabel: string;
  readonly timeLabel: string;
  /**
   * Capture timestamp of a transport-only arrival row, or `null` once the row
   * has a terminal outcome. This is the row's ONLY clock-dependent input, and it
   * is a raw timestamp rather than a resolved elapsed value on purpose: elapsed
   * time is derived where it is displayed, so a tick never has to travel back
   * through the list-wide mapping and re-map every visible row.
   */
  readonly arrivalCapturedAtMs: number | null;
}

/**
 * The two columns of a transport-only arrival row that change while the request
 * is genuinely outstanding. `null` (from `toTransactionRowLive`) means the row
 * has aged past the staleness window, so its settled view model applies again
 * and its clock must stop.
 */
export interface TransactionRowLiveViewModel {
  readonly outcome: string;
  readonly outcomeColor: HeroChipColor;
  readonly durationLabel: string;
}

/** One label/value line in a detail section. */
export interface TransactionDetailFieldRow {
  readonly label: string;
  readonly value: string;
}

/** Presentation-ready shape of the selected transaction's detail inspector. */
export interface TransactionDetailViewModel {
  readonly requestId: string;
  readonly methodKind: string;
  readonly route: string;
  readonly outcome: string;
  readonly outcomeColor: HeroChipColor;
  readonly statusLabel: string;
  readonly statusColor: HeroChipColor;
  readonly hasHttpStatus: boolean;
  readonly durationLabel: string;
  readonly timeLabel: string;
  readonly deviceName: string;
  readonly errorCode: string;
  readonly generalFields: readonly TransactionDetailFieldRow[];
  readonly requestHeaders: readonly TransactionDetailFieldRow[];
  readonly responseHeaders: readonly TransactionDetailFieldRow[];
  readonly requestPayload: TransactionBodyViewModel;
  readonly responseBody: TransactionBodyViewModel;
  /**
   * The projected sync diagnostics report for the Request tab, or `null` when
   * the capture is not on the diagnostics route. Off-route captures render no
   * projection at all; on-route captures with a skipped/empty/unreadable body
   * carry the explicit no-report outcome instead of fabricated values.
   */
  readonly diagnosticsReport: TransactionDiagnosticsReportViewModel | null;
  readonly correlations: readonly TransactionDetailFieldRow[];
}

/** Props for the top-level TransactionPanel container. */
export interface TransactionPanelProps {
  readonly source?: CaptureTransactionSource;
  readonly limit?: number;
  readonly runtimeSource?: CaptureRuntimeSource;
}

/** Everything the virtual window needs from the loaded rows. */
export interface TransactionPanelWindowInput {
  /** Every capture row loaded so far, newest-first: cursor pages at the tail, live pushes at the head. */
  readonly items: readonly CaptureRow[];
  /** Called when the virtual range reaches the last loaded row, so the next cursor page can be fetched. */
  readonly onReachEnd: () => void;
}

/** What the virtual window hands the dumb table: in-view rows, spacer heights, and the scroll ref. */
export interface TransactionPanelWindowModel {
  /** The capture rows the virtualizer reports in view (plus overscan). */
  readonly windowedRows: readonly CaptureRow[];
  /** Height in px of the unrendered content above the window; 0 when the window starts at the first row. */
  readonly topSpacerHeightPx: number;
  /** Height in px of the unrendered content below the window; 0 when the window ends at the last row. */
  readonly bottomSpacerHeightPx: number;
  /** Attaches to the rail's scroll container so the virtualizer can observe its rect and offset. */
  readonly scrollRef: RefCallback<HTMLDivElement>;
}

/**
 * Props for the dumb TransactionTable presentational component. The rows are
 * already the virtualizer's window; the spacer heights and the scroll ref are
 * the virtual window's rendering half. There is no `onScroll`: the virtualizer
 * observes the scroll element itself, and load-more fires from the virtual
 * range inside the window hook.
 */
export interface TransactionTableProps {
  readonly rows: readonly TransactionRowViewModel[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly isLoading: boolean;
  /** A settled filter query is in flight while rows are on screen: the table stays busy and announces it, but keeps rendering the rows. */
  readonly isUpdating: boolean;
  readonly topSpacerHeightPx: number;
  readonly bottomSpacerHeightPx: number;
  readonly scrollRef: RefCallback<HTMLDivElement>;
}

/** Props for the memoized TransactionRow presentational component. */
export interface TransactionRowProps {
  readonly row: TransactionRowViewModel;
}

/**
 * Props for the live OUTCOME cell of an arrival row. The settled values travel
 * alongside the timestamp so the cell falls back to the row's own presentation
 * once the request ages out, instead of hard-coding a second copy of it.
 */
export interface TransactionRowLiveOutcomeProps {
  readonly capturedAtMs: number;
  readonly settledOutcome: string;
  readonly settledOutcomeColor: HeroChipColor;
}

/** Props for the live DURATION cell of an arrival row. */
export interface TransactionRowLiveDurationProps {
  readonly capturedAtMs: number;
  readonly settledDurationLabel: string;
}

/**
 * Props for the dumb TransactionFilterBar presentational component.
 *
 * `status` is the exact HTTP status as typed (`''` when unset), not a class
 * bucket: the capture reader exposes an equality predicate on `http_status`,
 * so an exact status is the status filter it can evaluate over the whole table.
 */
export interface TransactionFilterBarProps {
  readonly route: string;
  readonly outcome: string;
  readonly kind: string;
  readonly status: string;
  readonly onRouteChange: (route: string) => void;
  readonly onOutcomeChange: (outcome: string) => void;
  readonly onKindChange: (kind: string) => void;
  readonly onStatusChange: (status: string) => void;
}

/** Props for the dumb TransactionDetail presentational component. */
export interface TransactionDetailProps {
  readonly detail: TransactionDetailViewModel | null;
  readonly detailTab: TransactionDetailTab;
  readonly onDetailTabChange: (tab: TransactionDetailTab) => void;
  readonly onClose: () => void;
}
