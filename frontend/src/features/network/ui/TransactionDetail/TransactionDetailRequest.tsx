import { CodeBlock } from '../../../../shared/ui/CodeBlock';
import type { TransactionBodyViewModel, TransactionDetailFieldRow } from '../TransactionPanel/transaction-panel.types';

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
    <div className="flex flex-col gap-3 py-2">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-default-500">Headers</span>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {headers.map((header) => (
            <div className="contents" key={header.label}>
              <dt className="font-mono text-default-500">{header.label}</dt>
              <dd className="truncate text-foreground">{header.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <CodeBlock label="Payload" notice={payload.notice} raw={payload.raw} state={payload.state} />
    </div>
  );
}
