/** One transactions column: its label and the fixed width class that keeps the rail from resizing. */
export interface TransactionTableColumn {
  /** Column header text. */
  readonly label: string;
  /** Tailwind width class; omitted for the single flexible column. */
  readonly widthClass?: string;
}

/**
 * The six transactions columns, shared by the real `Table.Column` header and the
 * loading placeholder header so the two cannot drift apart.
 */
export const TRANSACTION_TABLE_COLUMNS: readonly TransactionTableColumn[] = [
  { label: 'Time', widthClass: 'w-[92px]' },
  { label: 'Method', widthClass: 'w-[96px]' },
  { label: 'Route' },
  { label: 'Outcome', widthClass: 'w-[104px]' },
  { label: 'Status', widthClass: 'w-[88px]' },
  { label: 'Duration', widthClass: 'w-[104px]' },
];
