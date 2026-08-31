import { Chip } from '@heroui/react';
import type { TransactionRowLiveOutcomeProps } from '../TransactionPanel/transaction-panel.types';
import { useTransactionRowLive } from './use-transaction-row-live';

/**
 * Dumb OUTCOME chip of a transport-only arrival row.
 *
 * It sits INSIDE the table cell rather than around the row on purpose: React
 * Aria keeps a cell's children in the real tree, so this component's clock
 * re-renders this chip alone. A clock one level up, around the row, would push
 * the update back through the collection and re-render the whole table body —
 * the very cost this split removes.
 */
export function TransactionRowLiveOutcome({ capturedAtMs, settledOutcome, settledOutcomeColor }: Readonly<TransactionRowLiveOutcomeProps>) {
  const live = useTransactionRowLive(capturedAtMs);

  return (
    <Chip color={live === null ? settledOutcomeColor : live.outcomeColor} size="sm" variant="soft">
      {live === null ? settledOutcome : live.outcome}
    </Chip>
  );
}
