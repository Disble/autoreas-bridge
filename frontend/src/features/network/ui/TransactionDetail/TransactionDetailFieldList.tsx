import type { TransactionDetailFieldRow } from '../TransactionPanel/transaction-panel.types';

/**
 * Dumb label/value list shared by every transaction detail pane (General
 * fields, General correlations, Request headers, Response headers).
 *
 * It exists as one component rather than four copies of the same `dl` because
 * the containment rules below are the thing that kept being got wrong, and four
 * copies is four places for the next one to drift:
 *
 * - `minmax(0, …)` on BOTH tracks. A bare `1fr` is `minmax(auto, 1fr)`, and a
 *   grid track whose minimum is content-based can grow past its own container.
 *   The previous `truncate` on the value was containing it (an `overflow:
 *   hidden` grid item has an automatic minimum size of zero), so this is the
 *   containment that replaces the one `break-all` gives up -- not a second one.
 * - `break-all` rather than `truncate` on the value. These are header values
 *   and identifiers -- an `Authorization` token, a JDownloader URL -- and the
 *   user needs to read them whole, so an ellipsis was hiding exactly the end
 *   that distinguishes one from another. The label gets the same treatment so a
 *   hostile header NAME cannot outgrow its own track either.
 */
export function TransactionDetailFieldList({ rows }: Readonly<{ rows: readonly TransactionDetailFieldRow[] }>) {
  return (
    <dl className="grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {rows.map((row) => (
        <div className="contents" key={row.label}>
          <dt className="break-all font-mono text-default-500">{row.label}</dt>
          <dd className="break-all text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
