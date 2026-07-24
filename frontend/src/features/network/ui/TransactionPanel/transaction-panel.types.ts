import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source';
import type { CaptureRow } from '../../../../shared/contracts/capture.types';
import type { TransactionStatusClassFilter } from '../../../../shared/store/transaction-store';

/** HeroUI Chip color tokens supported by the project's design system. */
export type HeroChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/** Active tab in the transaction detail inspector. */
export type TransactionDetailTab = 'general' | 'request' | 'response';

export type { CaptureRow };

/** Presentation-ready shape of a single transaction row. */
export interface TransactionRowViewModel {
  readonly id: string;
  readonly methodKind: string;
  readonly route: string;
  readonly outcome: string;
  readonly statusLabel: string;
  readonly statusColor: HeroChipColor;
  readonly durationLabel: string;
  readonly timeLabel: string;
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
  readonly statusLabel: string;
  readonly statusColor: HeroChipColor;
  readonly durationLabel: string;
  readonly timeLabel: string;
  readonly deviceName: string;
  readonly errorCode: string;
  readonly generalFields: readonly TransactionDetailFieldRow[];
  readonly requestHeaders: readonly TransactionDetailFieldRow[];
  readonly responseHeaders: readonly TransactionDetailFieldRow[];
  readonly requestPayload: string;
  readonly responseBody: string;
  readonly correlations: readonly TransactionDetailFieldRow[];
}

/** Props for the top-level TransactionPanel container. */
export interface TransactionPanelProps {
  readonly source?: CaptureTransactionSource;
  readonly limit?: number;
}

/** Props for the dumb TransactionTable presentational component. */
export interface TransactionTableProps {
  readonly rows: readonly TransactionRowViewModel[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly isLoading: boolean;
}

/** Props for the dumb TransactionFilterBar presentational component. */
export interface TransactionFilterBarProps {
  readonly route: string;
  readonly outcome: string;
  readonly kind: string;
  readonly statusClass: TransactionStatusClassFilter;
  readonly query: string;
  readonly onRouteChange: (route: string) => void;
  readonly onOutcomeChange: (outcome: string) => void;
  readonly onKindChange: (kind: string) => void;
  readonly onStatusClassChange: (statusClass: TransactionStatusClassFilter) => void;
  readonly onQueryChange: (query: string) => void;
}

/** Props for the dumb TransactionDetail presentational component. */
export interface TransactionDetailProps {
  readonly detail: TransactionDetailViewModel | null;
  readonly detailTab: TransactionDetailTab;
  readonly onDetailTabChange: (tab: TransactionDetailTab) => void;
  readonly onClose: () => void;
}

/** A status-class filter pill option (`transaction-panel.constants.ts`). */
export interface TransactionStatusClassFilterOption {
  readonly value: TransactionStatusClassFilter;
  readonly label: string;
}
