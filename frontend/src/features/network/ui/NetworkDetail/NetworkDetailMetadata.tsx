import type { NetworkDetailViewModel } from '../NetworkPanel/network-panel.types';

/** Dumb Metadata tab: renders the selected entry's metadata as a key-value table. */
export function NetworkDetailMetadata({ metadataEntries }: Readonly<Pick<NetworkDetailViewModel, 'metadataEntries'>>) {
  if (metadataEntries.length === 0) {
    return <span className="text-sm text-default-400">No metadata.</span>;
  }

  return (
    // This tab has no pane of its own to fill, so it IS the scroller. The card
    // carries a height budget now, and a metadata grid that outgrew it would
    // spill out of the bottom of a card nothing clips.
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-white/5 bg-white/[0.02] p-2.5 sm:grid-cols-2">
      {metadataEntries.map(([key, value]) => (
        <div className="min-w-0" key={key}>
          <span className="block truncate text-xs text-default-500">{key}</span>
          <span className="block break-all text-sm text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}
