import { NETWORK_TRACE_NO_CORRELATION_MESSAGE } from '../NetworkPanel/network-panel.constants';
import type { NetworkDetailViewModel } from '../NetworkPanel/network-panel.types';

/** Dumb Trace tab: renders the persisted sibling events time-ordered, highlighting the selected one. An event with no correlation id states so explicitly — an empty list would imply its siblings were lost. */
export function NetworkDetailTrace({
  traceEntries,
  hasCorrelation,
}: Readonly<Pick<NetworkDetailViewModel, 'traceEntries' | 'hasCorrelation'>>) {
  if (!hasCorrelation) {
    return <p className="px-1.5 py-1 text-xs text-default-400">{NETWORK_TRACE_NO_CORRELATION_MESSAGE}</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {traceEntries.map((traceEntry) => (
        <li
          className={`truncate rounded px-1.5 py-1 text-xs ${
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
