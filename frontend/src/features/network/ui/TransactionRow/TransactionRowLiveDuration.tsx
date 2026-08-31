import type { TransactionRowLiveDurationProps } from '../TransactionPanel/transaction-panel.types';
import { useTransactionRowLive } from './use-transaction-row-live';

/**
 * Dumb DURATION cell of a transport-only arrival row: the live `now -
 * capturedAtMs` elapsed indicator while the request is outstanding, falling back
 * to the row's settled label once it has aged out.
 *
 * It keeps its own clock instead of sharing one with the outcome chip because
 * the two live in different table cells, and React Aria renders each cell's
 * children separately. Two intervals for one outstanding row is a rounding error
 * next to what a single list-wide interval used to cost; both read real time, so
 * they cannot disagree.
 */
export function TransactionRowLiveDuration({ capturedAtMs, settledDurationLabel }: Readonly<TransactionRowLiveDurationProps>) {
  const live = useTransactionRowLive(capturedAtMs);

  return <span className="font-mono text-[11px] text-default-500">{live === null ? settledDurationLabel : live.durationLabel}</span>;
}
