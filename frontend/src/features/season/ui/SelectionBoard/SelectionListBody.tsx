import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { AIRIS_CLEAR_CRITERIA_LABEL } from '../../../../shared/ui/AirisEmptyState/airis-empty-state.constants';
import { SELECTION_FILTERED_EMPTY_DESCRIPTION, SELECTION_FILTERED_EMPTY_TITLE } from './selection-board.constants';
import { SelectionGroupSection } from './SelectionGroupSection';
import type { SelectionListBodyProps } from './selection-board.types';

/**
 * SelectionListBody renders what the criteria leave: the Approved-then-Rejected
 * groups with their visible/total counts, or — when the criteria hide every row
 * — the filtered empty state, whose neutral icon and clear action replace the
 * waiting-on-step mascot that belongs to a selection with no candidates at all.
 */
export function SelectionListBody({
  groups,
  groupTotals,
  matchingCount,
  totalCount,
  readOnly,
  getCoverThumb,
  onResetView,
  onSetConsideration,
  onOpenPage,
  onCopyPage,
  onOpenFolder,
  onCopyFolder,
}: Readonly<SelectionListBodyProps>) {
  if (matchingCount === 0) {
    return (
      <AirisEmptyState
        action={{ label: AIRIS_CLEAR_CRITERIA_LABEL, onPress: onResetView }}
        description={SELECTION_FILTERED_EMPTY_DESCRIPTION}
        kind="filtered"
        size="section"
        title={SELECTION_FILTERED_EMPTY_TITLE}
      />
    );
  }
  return (
    <>
      {groups.map((group) => (
        <SelectionGroupSection
          key={group.verdict}
          getCoverThumb={getCoverThumb}
          group={group}
          readOnly={readOnly}
          total={groupTotals[group.verdict]}
          onCopyFolder={onCopyFolder}
          onCopyPage={onCopyPage}
          onOpenFolder={onOpenFolder}
          onOpenPage={onOpenPage}
          onSetConsideration={onSetConsideration}
        />
      ))}
      <p className="text-xs text-muted">View only · Confirm selection still applies to all {totalCount} candidates.</p>
    </>
  );
}
