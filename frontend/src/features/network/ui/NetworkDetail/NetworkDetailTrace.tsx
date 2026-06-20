import type { NetworkDetailViewModel } from '../NetworkPanel/network-panel.types';

/** Dumb Trace tab: renders the correlated sibling entries time-ordered, highlighting the selected one. */
export function NetworkDetailTrace({ traceEntries }: Readonly<Pick<NetworkDetailViewModel, 'traceEntries'>>) {
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
