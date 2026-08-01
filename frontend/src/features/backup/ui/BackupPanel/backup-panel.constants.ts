/** Human-readable label for each bundle group name, keyed by the wire `name` field. */
export const BACKUP_GROUP_LABELS: Readonly<Record<string, string>> = {
  anime_snapshots: 'animes',
  seasons: 'seasons',
  season_animes: 'season animes',
};

/** Fallback error message when an export fails without a usable error message. */
export const BACKUP_EXPORT_UNKNOWN_ERROR_MESSAGE = 'Backup export failed unexpectedly.';

/** Idle/success label on the export button. */
export const BACKUP_PANEL_EXPORT_LABEL = 'Export backup';
/** Busy label on the export button while a run is in flight. */
export const BACKUP_PANEL_EXPORTING_LABEL = 'Exporting…';
