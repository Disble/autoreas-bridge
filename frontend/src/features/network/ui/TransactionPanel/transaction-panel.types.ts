import type { CaptureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { CodeBlockState } from '../../../../shared/ui/CodeBlock/code-block.types';

/** HeroUI Chip color tokens supported by the project's design system. */
export type HeroChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

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

/** Presentation-ready shape of a single transaction row. */
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
  readonly isPending: boolean;
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
  readonly correlations: readonly TransactionDetailFieldRow[];
}

/** Props for the top-level TransactionPanel container. */
export interface TransactionPanelProps {
  readonly source?: CaptureTransactionSource;
  readonly limit?: number;
  readonly runtimeSource?: CaptureRuntimeSource;
}

/**
 * Props for the dumb TransactionTable presentational component. `hasNextPage`
 * decides whether the `Table.LoadMore` sentinel is mounted at all; once the
 * backend has returned a page with no cursor and the window covers every loaded
 * row, there is nothing left to ask for and the sentinel goes away.
 */
export interface TransactionTableProps {
  readonly rows: readonly TransactionRowViewModel[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly isLoading: boolean;
  readonly hasNextPage: boolean;
  readonly onLoadMore: () => void;
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
