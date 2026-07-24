import type { TransactionDetailFieldRow } from '../TransactionPanel/transaction-panel.types';

/** Dumb Request-tab pane: request headers plus the JSON request payload. */
export function TransactionDetailRequest({
  headers,
  payload,
}: Readonly<{ headers: readonly TransactionDetailFieldRow[]; payload: string }>) {
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

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-default-500">Payload</span>
        <pre className="max-h-64 overflow-auto rounded-md bg-content2/40 p-2 font-mono text-xs text-foreground">{payload}</pre>
      </div>
    </div>
  );
}
