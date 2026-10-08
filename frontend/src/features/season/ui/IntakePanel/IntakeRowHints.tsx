import { formatMetadataSummary } from './intake-panel.helpers';
import type { IntakeRowHintsProps } from './intake-panel.types';

/**
 * IntakeRowHints renders the short line under an intake row's name: the one-line
 * summary of the metadata a lookup attached (kind · episodes · minutes ·
 * studios), and, once the row can be created, how many episodes its matched page
 * already has online. Each part renders only when it has something to say.
 * Purely presentational.
 */
export function IntakeRowHints({ row, creatable, heldMetadata }: Readonly<IntakeRowHintsProps>) {
  const summary = heldMetadata === undefined ? '' : formatMetadataSummary(heldMetadata);
  return (
    <div className="flex flex-wrap gap-x-3 pl-7 text-xs">
      {summary === '' ? null : (
        <span className="text-muted" data-testid="intake-row-summary">
          {summary}
        </span>
      )}
      {creatable ? (
        <span className="text-success">
          {row.availableEpisodes} episode{row.availableEpisodes === 1 ? '' : 's'} available
        </span>
      ) : null}
    </div>
  );
}
