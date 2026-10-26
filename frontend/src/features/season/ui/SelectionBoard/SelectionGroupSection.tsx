import { SelectionCandidateRow } from './SelectionCandidateRow';
import type { SelectionGroup, SelectionListBodyProps } from './selection-board.types';

/** One verdict group of the candidate list: heading and rows. */
interface SelectionGroupSectionProps
  extends Pick<
    SelectionListBodyProps,
    'readOnly' | 'getCoverThumb' | 'onOpenPage' | 'onCopyPage' | 'onOpenFolder' | 'onCopyFolder' | 'onSetConsideration'
  > {
  /** The visible group, already filtered and sorted. */
  readonly group: SelectionGroup;
  /** How many rows this verdict holds before filtering. */
  readonly total: number;
}

/**
 * SelectionGroupSection renders one verdict group: a muted heading with the
 * visible/total count and the candidate rows, whose list is labelled by that
 * heading so screen readers announce the group with its rows.
 */
export function SelectionGroupSection({
  group,
  total,
  readOnly,
  getCoverThumb,
  onSetConsideration,
  onOpenPage,
  onCopyPage,
  onOpenFolder,
  onCopyFolder,
}: Readonly<SelectionGroupSectionProps>) {
  /** The id that ties the list to its group heading. */
  const headingId = `selection-group-${group.verdict}`;
  return (
    <div className="flex flex-col">
      <p className="px-1 pt-1 text-xs font-semibold text-muted" id={headingId}>
        {group.label} · {group.rows.length} / {total}
      </p>
      <ul aria-labelledby={headingId} className="flex flex-col divide-y divide-separator">
        {group.rows.map((row) => (
          <SelectionCandidateRow
            key={row.id}
            coverThumb={getCoverThumb(row.animeId)}
            readOnly={readOnly}
            row={row}
            onCopyFolder={onCopyFolder}
            onCopyPage={onCopyPage}
            onOpenFolder={onOpenFolder}
            onOpenPage={onOpenPage}
            onSetConsideration={onSetConsideration}
          />
        ))}
      </ul>
    </div>
  );
}
