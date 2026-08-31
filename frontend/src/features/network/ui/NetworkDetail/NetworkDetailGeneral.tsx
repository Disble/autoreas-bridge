import type { NetworkDetailViewModel } from '../NetworkPanel/network-panel.types';

/** Dumb General tab: renders the selected entry's Fields section (label/value grid). */
export function NetworkDetailGeneral({ fields }: Readonly<Pick<NetworkDetailViewModel, 'fields'>>) {
  return (
    // This tab has no pane of its own to fill, so it IS the scroller. The card
    // carries a height budget now, and a fields grid that outgrew it would
    // spill out of the bottom of a card nothing clips.
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
      {fields.map(([key, value]) => (
        <div className="min-w-0" key={key}>
          <span className="block truncate text-xs text-default-500">{key}</span>
          <span className="block break-all text-sm text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}
