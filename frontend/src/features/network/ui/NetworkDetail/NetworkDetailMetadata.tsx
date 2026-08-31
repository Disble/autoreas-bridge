import type { NetworkDetailViewModel } from '../NetworkPanel/network-panel.types';

/**
 * Classes for a single-line value: unchanged from before structured values
 * existed, so an ordinary path or method still looks exactly as it did.
 */
const PLAIN_VALUE_CLASS = 'block break-all text-sm text-foreground';

/**
 * Classes for a pretty-printed value. `whitespace-pre-wrap` is what keeps the
 * indentation the projection produced, and `break-all` still applies: the value
 * wraps rather than scrolling, so a long token inside the JSON cannot widen the
 * card the way an unbroken URL once widened the whole window.
 */
const STRUCTURED_VALUE_CLASS = 'block whitespace-pre-wrap break-all rounded-md bg-content2/40 p-2 font-mono text-xs text-foreground';

/**
 * Dumb Metadata tab: renders the selected entry's metadata as a key-value table.
 *
 * A structured value arrives here already pretty-printed, so it is a multi-line
 * block rather than a single line, and it needs `whitespace-pre-wrap` and a
 * mono face to stay legible. `break-all` is what keeps that block inside the
 * grid: the grid is `overflow-y-auto`, which makes its `overflow-x` compute to
 * `auto` as well, so an unbreakable token inside the JSON would be absorbed as
 * a horizontal scrollbar the card can never see. `data-network-metadata-grid`
 * is the layout fixture's handle on exactly that box.
 */
export function NetworkDetailMetadata({ metadataEntries }: Readonly<Pick<NetworkDetailViewModel, 'metadataEntries'>>) {
  if (metadataEntries.length === 0) {
    return <span className="text-sm text-default-400">No metadata.</span>;
  }

  return (
    // This tab has no pane of its own to fill, so it IS the scroller. The card
    // carries a height budget now, and a metadata grid that outgrew it would
    // spill out of the bottom of a card nothing clips.
    <div
      className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-white/5 bg-white/[0.02] p-2.5 sm:grid-cols-2"
      data-network-metadata-grid
    >
      {metadataEntries.map(({ key, value, isMultiline }) => (
        <div className="min-w-0" key={key}>
          <span className="block truncate text-xs text-default-500">{key}</span>
          <span className={isMultiline ? STRUCTURED_VALUE_CLASS : PLAIN_VALUE_CLASS}>{value}</span>
        </div>
      ))}
    </div>
  );
}
