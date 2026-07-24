import type { TransactionDetailFieldRow } from '../TransactionPanel/transaction-panel.types';

/** Dumb General-tab field list: label/value rows plus correlations, if any. */
export function TransactionDetailGeneral({
  fields,
  correlations,
}: Readonly<{ fields: readonly TransactionDetailFieldRow[]; correlations: readonly TransactionDetailFieldRow[] }>) {
  return (
    <div className="flex flex-col gap-3 py-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {fields.map((field) => (
          <div className="contents" key={field.label}>
            <dt className="font-mono text-default-500">{field.label}</dt>
            <dd className="truncate text-foreground">{field.value}</dd>
          </div>
        ))}
      </dl>

      {correlations.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-default-500">Correlations</span>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {correlations.map((correlation) => (
              <div className="contents" key={correlation.label}>
                <dt className="font-mono text-default-500">{correlation.label}</dt>
                <dd className="truncate text-foreground">{correlation.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
