import { Card } from '@heroui/react';
import { MAX_GRADE, MIN_GRADE } from './selection-board.constants';
import { SelectionConfirmAction } from './SelectionConfirmAction';
import { SelectionStatusChips } from './SelectionStatusChips';
import { SelectionStepper } from './SelectionStepper';
import type { SelectionDecisionHeaderProps } from './selection-board.types';

/**
 * SelectionDecisionHeader is the Selection board's decision bar: the minimum
 * approval grade and slot steppers, the live quota meter and the confirmed
 * milestone chips, and the confirm action. It is presentational: every value and
 * edit arrives as a prop, and the status chips appear only once candidates exist.
 */
export function SelectionDecisionHeader({
  readOnly,
  minApprovalGrade,
  slots,
  approvedCount,
  rejectedCount,
  quota,
  selectionConfirmedAt,
  hasRows,
  onSetMinApprovalGrade,
  onSetSlots,
  onConfirm,
}: Readonly<SelectionDecisionHeaderProps>) {
  return (
    <Card>
      <Card.Content>
        <div className="flex flex-wrap items-end gap-6">
          <SelectionStepper
            canDecrease={minApprovalGrade > MIN_GRADE && !readOnly}
            canIncrease={minApprovalGrade < MAX_GRADE && !readOnly}
            decreaseLabel="Decrease minimum approval grade"
            increaseLabel="Increase minimum approval grade"
            label="Minimum approval grade"
            value={minApprovalGrade}
            onDecrease={() => onSetMinApprovalGrade(minApprovalGrade - 1)}
            onIncrease={() => onSetMinApprovalGrade(minApprovalGrade + 1)}
          />
          <SelectionStepper
            canDecrease={slots > 1 && !readOnly}
            canIncrease={!readOnly}
            decreaseLabel="Decrease slots"
            increaseLabel="Increase slots"
            label="Slots"
            value={slots}
            onDecrease={() => onSetSlots(slots - 1)}
            onIncrease={() => onSetSlots(slots + 1)}
          />

          <SelectionStatusChips
            approvedCount={approvedCount}
            hasRows={hasRows}
            quota={quota}
            selectionConfirmedAt={selectionConfirmedAt}
            slots={slots}
          />

          {!readOnly && hasRows ? (
            <div className="ml-auto">
              <SelectionConfirmAction
                approvedCount={approvedCount}
                isOverQuota={quota === 'over'}
                rejectedCount={rejectedCount}
                slots={slots}
                onConfirm={onConfirm}
              />
            </div>
          ) : null}
        </div>
      </Card.Content>
    </Card>
  );
}
