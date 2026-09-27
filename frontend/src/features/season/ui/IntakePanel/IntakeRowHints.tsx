import type { IntakeRowHintsProps } from './intake-panel.types';

/**
 * IntakeRowHints renders the two optional hints of a creatable intake row: how many
 * episodes its matched page already has online, and the download folder this row
 * overrides. A row that cannot be created yet renders neither, because both claims
 * would be premature. Purely presentational.
 */
export function IntakeRowHints({ row, creatable, folderOverride }: Readonly<IntakeRowHintsProps>) {
  if (!creatable) {
    return null;
  }
  return (
    <>
      <span className="text-xs text-success">
        {row.availableEpisodes} episode{row.availableEpisodes === 1 ? '' : 's'} available
      </span>
      {folderOverride === undefined ? null : (
        <span className="w-full break-all text-xs text-success">Folder: {folderOverride}</span>
      )}
    </>
  );
}
