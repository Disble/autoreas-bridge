import { NETWORK_TRACE_NO_CORRELATION_MESSAGE } from '../NetworkPanel/network-panel.constants';
import type { NetworkDetailViewModel } from '../NetworkPanel/network-panel.types';

/**
 * Dumb Trace tab: renders the persisted sibling events time-ordered, highlighting the selected one. An event with no correlation id states so explicitly — an empty list would imply its siblings were lost.
 *
 * This is the pane that was measured pushing the whole window sideways: with
 * 40 siblings carrying an unbroken JDownloader URL, the card's content came out
 * at 2950px inside a 471px card and the document at 3719px against a 1241px
 * viewport. Two rules keep it in:
 *
 * - The message WRAPS (`break-all`) instead of truncating. These are prose-like
 *   lines carrying URLs and error text the user has to read whole, so an
 *   ellipsis was hiding the part that mattered even while it fitted.
 * - The list is height-bounded and scrolls vertically. A correlated event can
 *   have dozens of siblings, and each one is now allowed several lines. The
 *   bound matches `CodeBlock`'s own `max-h-64`, so the card's two scrollable
 *   panes agree; the `32rem` figure belongs to the full rail containers, not to
 *   a pane nested inside a card.
 *
 * The containment is deliberately redundant with the `min-w-0` chain above it.
 * Measured one piece at a time, neither alone is what holds: reverting only
 * this pane, only the card's `min-w-0`, or only the grid's `minmax(0, …)` still
 * leaves the page contained, while reverting all of them reproduces the 3719px
 * document. `data-network-trace-list` is the layout fixture's handle on it.
 */
export function NetworkDetailTrace({
  traceEntries,
  hasCorrelation,
}: Readonly<Pick<NetworkDetailViewModel, 'traceEntries' | 'hasCorrelation'>>) {
  if (!hasCorrelation) {
    return <p className="px-1.5 py-1 text-xs text-default-400">{NETWORK_TRACE_NO_CORRELATION_MESSAGE}</p>;
  }

  return (
    <ul className="flex max-h-64 min-w-0 flex-col gap-1 overflow-y-auto" data-network-trace-list>
      {traceEntries.map((traceEntry) => (
        <li
          className={`min-w-0 break-all rounded px-1.5 py-1 text-xs ${
            traceEntry.isSelected ? 'bg-primary/10 text-foreground' : 'text-default-400'
          }`}
          key={traceEntry.id}
        >
          <span className="mr-2 font-mono">{traceEntry.timeLabel}</span>
          <span className="mr-2 text-default-500">{traceEntry.domain}</span>
          {traceEntry.message}
        </li>
      ))}
    </ul>
  );
}
