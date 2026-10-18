/**
 * Determines whether the SQLite status is still loading.
 * The UI uses an empty string as the initial bootstrap value before the Wails call resolves.
 */
export function isSQLiteStatusLoading(sqliteStatus: string) {
  return sqliteStatus === '';
}

/**
 * Maps the SQLite status string to the HeroUI chip tone.
 * This keeps semantic UI decisions out of the presentational component.
 */
export function getSQLiteStatusTone(sqliteStatus: string): 'success' | 'danger' {
  const normalizedStatus = sqliteStatus.toLowerCase();

  return normalizedStatus.includes('ok') || normalizedStatus.includes('open') ? 'success' : 'danger';
}
