import { CodeBlock } from '../../../../shared/ui/CodeBlock/CodeBlock';
import type { TransactionBodyViewModel, TransactionDetailFieldRow } from '../TransactionPanel/transaction-panel.types';
import { TransactionDetailFieldList } from './TransactionDetailFieldList';

/**
 * Dumb Request-tab pane: request headers plus the exact captured request body,
 * rendered through the shared `CodeBlock` primitive. `CaptureDetail.payload`
 * still exists for semantic/domain consumers, while this pane reads only the
 * dedicated raw `requestBody` field mapped by `toTransactionBody`.
 */
export function TransactionDetailRequest({
  headers,
  payload,
}: Readonly<{ headers: readonly TransactionDetailFieldRow[]; payload: TransactionBodyViewModel }>) {
  return (
    <div className="flex min-w-0 flex-col gap-3 py-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-default-500">Headers</span>
        <TransactionDetailFieldList rows={headers} />
      </div>

      <CodeBlock label="Payload" notice={payload.notice} raw={payload.raw} state={payload.state} />
    </div>
  );
}
