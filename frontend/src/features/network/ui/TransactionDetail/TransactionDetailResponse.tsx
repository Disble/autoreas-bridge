import { CodeBlock } from '../../../../shared/ui/CodeBlock/CodeBlock';
import { TRANSACTION_BODY_PROJECTION_NOTE } from '../TransactionPanel/transaction-panel.constants';
import type { TransactionBodyViewModel, TransactionDetailFieldRow } from '../TransactionPanel/transaction-panel.types';
import { TransactionDetailFieldList } from './TransactionDetailFieldList';

/**
 * Dumb Response-tab pane: response headers plus the response body, rendered
 * through the shared `CodeBlock` primitive with explicit captured/not-
 * captured/redacted states (no "Not captured" fallback baked into the body
 * text — `transaction-panel.helpers.ts#toTransactionBody` owns that
 * distinction). Carries the standing sanitized-projection note: a captured
 * body is a key-allowlisted projection of the real wire body, never a claim
 * of completeness.
 */
export function TransactionDetailResponse({
  headers,
  body,
}: Readonly<{ headers: readonly TransactionDetailFieldRow[]; body: TransactionBodyViewModel }>) {
  return (
    <div className="flex min-w-0 flex-col gap-3 py-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-default-500">Headers</span>
        <TransactionDetailFieldList rows={headers} />
      </div>

      <CodeBlock label="Body" notice={body.notice} raw={body.raw} state={body.state} />
      {body.state === 'captured' ? <p className="text-[11px] text-default-400">{TRANSACTION_BODY_PROJECTION_NOTE}</p> : null}
    </div>
  );
}
