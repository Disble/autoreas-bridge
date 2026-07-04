/** HeroUI Chip color tokens supported by the project's design system (mirrors `NetworkPanel`'s `HeroChipColor`). */
export type HeroChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/** Props for the top-level HistoryTable component. */
export interface HistoryTableProps {
  readonly className?: string;
}

/** One entry of the numbered-pagination control: a page number or a gap marker. */
export type HistoryPageItem = number | 'ellipsis';

/** A single option shown in a visible labeled filter/sort control (estado, tipo, sort). */
export interface HistoryFilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Parsed shape of the `/history` URL query-string state (spec: "History
 * State Survives Navigation"). Every field carries its default value when
 * the corresponding query param is absent or invalid -- never `undefined`.
 */
export interface HistoryParamsState {
  readonly q: string;
  readonly estado: string;
  readonly tipo: string;
  readonly sort: string;
  readonly page: number;
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
 * state setter (search/filter/sort/page, persisted to the URL) -- History is
 * read-only per spec, so none of these trigger a write/patch/reconcile call
 * against the bridge.
 */
export interface HistoryTableState {
  readonly rows: readonly HistoryRowViewModel[];
  readonly isLoading: boolean;
  readonly isEmpty: boolean;
  readonly searchQuery: string;
  readonly estadoFilter: string;
  readonly estadoOptions: readonly HistoryFilterOption[];
  readonly tipoFilter: string;
  readonly tipoOptions: readonly HistoryFilterOption[];
  readonly sortOrder: string;
  readonly sortOptions: readonly HistoryFilterOption[];
  readonly page: number;
  readonly totalPages: number;
  readonly pageItems: readonly HistoryPageItem[];
  readonly onSearchQueryChange: (query: string) => void;
  readonly onEstadoFilterChange: (estado: string) => void;
  readonly onTipoFilterChange: (tipo: string) => void;
  readonly onSortOrderChange: (sort: string) => void;
  readonly onPageChange: (page: number) => void;
}
