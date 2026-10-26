import { Alert } from '@heroui/react';
import seasonAirisArtwork from '../../../../assets/airis-empty-states/season.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { SELECTION_EMPTY_ACTION_LABEL, SELECTION_EMPTY_DESCRIPTION, SELECTION_EMPTY_TITLE } from './selection-board.constants';
import { SelectionCandidateList } from './SelectionCandidateList';
import { SelectionDecisionHeader } from './SelectionDecisionHeader';
import { useSelectionBoard } from './use-selection-board';
import type { SelectionBoardProps } from './selection-board.types';

/**
 * SelectionBoard is the native replacement for the 10-year selection Excel: a
 * decision header (minimum approval grade + slots steppers, live quota meter), a
 * filter toolbar that narrows only the view, the candidates grouped as Approved
 * then Rejected by their live verdict, and a confirm action that reconciles the
 * verdicts into anime writes. All Wails I/O, state, and derivation live in the
 * colocated `useSelectionBoard` hook and pure helpers; this component composes.
 */
export function SelectionBoard({ onNavigate }: Readonly<SelectionBoardProps>) {
  const {
    readOnly,
    minApprovalGrade,
    slots,
    rows,
    groups,
    groupTotals,
    criteria,
    filterGroups,
    sortOptions,
    summaryOptions,
    activeFilterCount,
    matchingCount,
    totalCount,
    onGroupChange,
    onResetFilters,
    onResetView,
    onSortChange,
    approvedCount,
    quota,
    selectionConfirmedAt,
    errorMessage,
    onSetMinApprovalGrade,
    onSetSlots,
    onSetConsideration,
    onConfirm,
    onOpenPage,
    onCopyPage,
    onOpenFolder,
    onCopyFolder,
    getCoverThumb,
  } = useSelectionBoard();

  const hasRows = rows.length > 0;

  return (
    <section className="flex flex-col gap-4">
      {errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <SelectionDecisionHeader
        approvedCount={approvedCount}
        hasRows={hasRows}
        minApprovalGrade={minApprovalGrade}
        quota={quota}
        readOnly={readOnly}
        rejectedCount={rows.length - approvedCount}
        selectionConfirmedAt={selectionConfirmedAt}
        slots={slots}
        onConfirm={() => void onConfirm()}
        onSetMinApprovalGrade={onSetMinApprovalGrade}
        onSetSlots={onSetSlots}
      />

      {!hasRows && errorMessage === undefined ? (
        <AirisEmptyState
          action={{ label: SELECTION_EMPTY_ACTION_LABEL, onPress: () => onNavigate('evaluation') }}
          description={SELECTION_EMPTY_DESCRIPTION}
          imageSrc={seasonAirisArtwork}
          kind="waiting-on-step"
          title={SELECTION_EMPTY_TITLE}
        />
      ) : hasRows ? (
        <SelectionCandidateList
          body={{
            getCoverThumb,
            groupTotals,
            groups,
            matchingCount,
            readOnly,
            totalCount,
            onCopyFolder,
            onCopyPage,
            onOpenFolder,
            onOpenPage,
            onResetView,
            onSetConsideration,
          }}
          toolbar={{
            activeFilterCount,
            criteria,
            groups: filterGroups,
            matchingCount,
            sortOptions,
            summaryOptions,
            totalCount,
            onGroupChange,
            onResetFilters,
            onResetView,
            onSortChange,
          }}
        />
      ) : null}
    </section>
  );
}
