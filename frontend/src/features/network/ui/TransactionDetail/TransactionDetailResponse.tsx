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
    // The body pane takes whatever height the card has left, so a card
    // stretched by the rail beside it has no empty band under its content.
    //
    // The headers are NOT `shrink-0`, which they would be if they could only
    // ever be a line or two. A `location` header here carries a full
    // JDownloader URL and `break-all` gives it as many lines as it needs:
    // measured against that content, a fixed headers block left the body pane
    // 22px of a 512px card. So the block scrolls itself once it has taken more
    // than its share, and the pane below carries a floor.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 py-2">
      <div className="flex min-h-0 min-w-0 flex-col gap-1">
        <span className="shrink-0 text-xs font-medium text-default-500">Headers</span>
        <div className="min-h-0 overflow-y-auto">
          <TransactionDetailFieldList rows={headers} />
        </div>
      </div>

      <CodeBlock label="Body" notice={body.notice} raw={body.raw} state={body.state} />
      {body.state === 'captured' ? (
        <p className="shrink-0 text-[11px] text-default-400">{TRANSACTION_BODY_PROJECTION_NOTE}</p>
      ) : null}
    </div>
  );
}
