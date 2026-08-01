/** Human-readable label for each import group name, keyed by the wire `name` field. */
export const BACKUP_IMPORT_GROUP_LABELS: Readonly<Record<string, string>> = {
  anime_snapshots: 'animes',
  seasons: 'seasons',
  season_animes: 'season animes',
};

/** Fallback error message when an import fails without a usable error message. */
export const BACKUP_IMPORT_UNKNOWN_ERROR_MESSAGE = 'Backup import failed unexpectedly.';

/** Shown when a bundle carries no group this build knows about. */
export const BACKUP_IMPORT_NO_KNOWN_GROUPS_MESSAGE = 'This bundle carries no group this build knows.';

/** Idle-state label on the preview action. */
export const BACKUP_IMPORT_PREVIEW_LABEL = 'Preview import';
/** Busy label while a preview is in flight. */
export const BACKUP_IMPORT_PREVIEWING_LABEL = 'Previewing…';
/** Label on the destructive confirm action once a preview is available. */
export const BACKUP_IMPORT_CONFIRM_LABEL = 'Confirm import';
/** Busy label while an apply is in flight. */
export const BACKUP_IMPORT_APPLYING_LABEL = 'Importing…';
/** Label on the action that discards a produced preview without applying it. */
export const BACKUP_IMPORT_CANCEL_LABEL = 'Cancel';

/** Destructive-action warning shown alongside a produced preview, before confirmation. */
export const BACKUP_IMPORT_DESTRUCTIVE_WARNING =
  'Importing replaces every table this bundle carries with the bundle’s own rows. A restore point is created first, but this cannot be undone from the app.';
