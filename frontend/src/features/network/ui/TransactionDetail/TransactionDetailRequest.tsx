import { CodeBlock } from '../../../../shared/ui/CodeBlock/CodeBlock';
import type { TransactionBodyViewModel, TransactionDetailFieldRow } from '../TransactionPanel/transaction-panel.types';
import type { TransactionDiagnosticsReportViewModel } from './transaction-diagnostics.types';
import { TransactionDetailDiagnostics } from './TransactionDetailDiagnostics';
import { TransactionDetailFieldList } from './TransactionDetailFieldList';

/**
 * Dumb Request-tab pane: request headers, the projected sync diagnostics
 * report when the capture is on the diagnostics route, and the exact captured
 * request body through the shared `CodeBlock` primitive. `CaptureDetail.payload`
 * still exists for semantic/domain consumers, while this pane reads only the
 * dedicated raw `requestBody` field mapped by `toTransactionBody`.
 */
export function TransactionDetailRequest({
  headers,
  payload,
  diagnostics,
}: Readonly<{
  headers: readonly TransactionDetailFieldRow[];
  payload: TransactionBodyViewModel;
  diagnostics: TransactionDiagnosticsReportViewModel | null;
}>) {
  return (
    // The payload pane takes whatever the card has left, and `min-h-0` is what
    // lets it shrink back into that card rather than growing it. The headers
    // block above it scrolls itself for the same reason it does on the Response
    // pane: an `authorization` header is one unbroken token that `break-all`
    // spreads over as many lines as it needs, and a headers block that could
    // not give any of them back starved the pane below it.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 py-2">
      <div className="flex min-h-0 min-w-0 flex-col gap-1">
        <span className="shrink-0 text-xs font-medium text-default-500">Headers</span>
        <div className="min-h-0 overflow-y-auto">
          <TransactionDetailFieldList rows={headers} />
        </div>
      </div>

      {diagnostics !== null ? <TransactionDetailDiagnostics report={diagnostics} /> : null}

      <CodeBlock label="Payload" notice={payload.notice} raw={payload.raw} state={payload.state} />
    </div>
  );
}
