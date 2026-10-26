import { Chip } from '@heroui/react';
import { formatSelectionConfirmedLabel, getQuotaColor } from './selection-board.helpers';
import type { QuotaStatus } from './selection-board.types';

/** The status chips the decision header shows once candidates exist. */
interface SelectionStatusChipsProps {
  /** Whether any candidate exists; with none there is nothing to report. */
  readonly hasRows: boolean;
  /** How many candidates derive as approved. */
  readonly approvedCount: number;
  /** The current slot cap. */
  readonly slots: number;
  /** The quota meter state against the slot cap. */
  readonly quota: QuotaStatus;
  /** When the selection was last confirmed, absent when it never was. */
  readonly selectionConfirmedAt?: number | null;
}

/**
 * SelectionStatusChips renders the two soft chips that read the candidates'
 * verdicts: the approved/slots quota meter in its semantic color and the
 * confirmed milestone (neutral until it is confirmed). With no candidate both
 * chips are omitted, because they would report on nothing.
 */
export function SelectionStatusChips({ hasRows, approvedCount, slots, quota, selectionConfirmedAt }: Readonly<SelectionStatusChipsProps>) {
  if (!hasRows) {
    return null;
  }
  return (
    <>
      <Chip color={getQuotaColor(quota)} variant="soft">
        {approvedCount} / {slots} approved
      </Chip>
      <Chip color={selectionConfirmedAt ? 'success' : 'default'} variant="soft">
        {formatSelectionConfirmedLabel(selectionConfirmedAt)}
      </Chip>
    </>
  );
}
