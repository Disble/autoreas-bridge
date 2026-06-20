import type { NetworkDetailViewModel } from '../NetworkPanel/network-panel.types';

/** Dumb Metadata tab: renders the selected entry's metadata as a key-value table. */
export function NetworkDetailMetadata({ metadataEntries }: Readonly<Pick<NetworkDetailViewModel, 'metadataEntries'>>) {
  if (metadataEntries.length === 0) {
    return <span className="text-sm text-default-400">No metadata.</span>;
  }

  return (
    <div className="grid gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 sm:grid-cols-2">
      {metadataEntries.map(([key, value]) => (
        <div className="min-w-0" key={key}>
          <span className="block truncate text-xs text-default-500">{key}</span>
          <span className="block break-all text-sm text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}
