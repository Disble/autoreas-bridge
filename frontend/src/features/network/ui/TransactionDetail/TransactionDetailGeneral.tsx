import type { TransactionDetailFieldRow } from '../TransactionPanel/transaction-panel.types';
import { TransactionDetailFieldList } from './TransactionDetailFieldList';

/** Dumb General-tab field list: label/value rows plus correlations, if any. */
export function TransactionDetailGeneral({
  fields,
  correlations,
}: Readonly<{ fields: readonly TransactionDetailFieldRow[]; correlations: readonly TransactionDetailFieldRow[] }>) {
  return (
    // This tab has no pane of its own to fill, so it IS the scroller. The card
    // carries a height budget now, and a field list that outgrew it would spill
    // out of the bottom of a card nothing clips.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto py-2">
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
