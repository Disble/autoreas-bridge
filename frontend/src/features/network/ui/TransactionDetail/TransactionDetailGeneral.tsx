import type { TransactionDetailFieldRow } from '../TransactionPanel/transaction-panel.types';
import { TransactionDetailFieldList } from './TransactionDetailFieldList';

/** Dumb General-tab field list: label/value rows plus correlations, if any. */
export function TransactionDetailGeneral({
  fields,
  correlations,
}: Readonly<{ fields: readonly TransactionDetailFieldRow[]; correlations: readonly TransactionDetailFieldRow[] }>) {
  return (
    <div className="flex min-w-0 flex-col gap-3 py-2">
      <TransactionDetailFieldList rows={fields} />

      {correlations.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-default-500">Correlations</span>
          <TransactionDetailFieldList rows={correlations} />
        </div>
      ) : null}
    </div>
  );
}
