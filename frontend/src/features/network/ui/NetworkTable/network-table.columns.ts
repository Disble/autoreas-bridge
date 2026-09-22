/** One runtime-events column: its label and the fixed width class that keeps the rail from resizing. */
export interface NetworkTableColumn {
  /** Column header text. */
  readonly label: string;
  /** Tailwind width class; omitted for the single flexible column. */
  readonly widthClass?: string;
}

/**
 * The five runtime-events columns, shared by the real `Table.Column` header and
 * the loading placeholder header so the two cannot drift apart.
 */
export const NETWORK_TABLE_COLUMNS: readonly NetworkTableColumn[] = [
  { label: 'Time', widthClass: 'w-[92px]' },
  { label: 'Domain', widthClass: 'w-[120px]' },
  { label: 'Level', widthClass: 'w-[104px]' },
  { label: 'Event' },
  { label: 'Duration', widthClass: 'w-[104px]' },
];
