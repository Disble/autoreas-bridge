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
 * - The list fills the card and scrolls vertically. A correlated event can have
 *   dozens of siblings, and each one is now allowed several lines. It used to
 *   carry a fixed `max-h-64`, which contained the list but could not grow with
 *   the card -- and since the card is stretched by the rail beside it, that
 *   left a measured 261px of empty card underneath. What bounds the list now is
 *   `ACTIVITY_RAIL_HEIGHT_CLASS` on the card itself; `flex-1 min-h-0` is what
 *   makes the list absorb everything the fixed rows above it did not take.
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
    <ul className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-y-auto" data-network-trace-list>
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
