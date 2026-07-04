/** HeroUI Chip color tokens supported by the project's design system (mirrors `NetworkPanel`'s `HeroChipColor`). */
export type HeroChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/** Props for the top-level HistoryTable component. */
export interface HistoryTableProps {
  readonly className?: string;
}

/** One entry of the numbered-pagination control: a page number or a gap marker. */
export type HistoryPageItem = number | 'ellipsis';

/** A single estado-filter option shown in the visible filter control. */
export interface HistoryEstadoFilterOption {
  readonly value: string;
  readonly label: string;
}

/** Presentation-ready shape of a single History table row. */
export interface HistoryRowViewModel {
  readonly id: string;
  readonly rowNumber: number;
  readonly nombre: string;
  readonly nrocapvisto: number;
  readonly longDateLabel: string;
  readonly weekdayLabel: string;
  readonly timeLabel: string;
  readonly relativeRecencyLabel: string;
  readonly estado: number;
  readonly estadoLabel: string;
  readonly estadoColor: HeroChipColor;
}

/**
 * State returned by `useHistoryTable`. Every callback here is a client-side
 * state setter (search/filter/page) -- History is read-only per spec, so
 * none of these trigger a write/patch/reconcile call against the bridge.
 */
export interface HistoryTableState {
  readonly rows: readonly HistoryRowViewModel[];
  readonly isLoading: boolean;
  readonly isEmpty: boolean;
  readonly searchQuery: string;
  readonly estadoFilter: string;
  readonly estadoOptions: readonly HistoryEstadoFilterOption[];
  readonly page: number;
  readonly totalPages: number;
  readonly pageItems: readonly HistoryPageItem[];
  readonly onSearchQueryChange: (query: string) => void;
  readonly onEstadoFilterChange: (estado: string) => void;
  readonly onPageChange: (page: number) => void;
}
