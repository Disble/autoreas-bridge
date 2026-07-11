/**
 * Preferences request/reply port for downloads root and read-only season mode.
 */
export interface PreferencesSource {
  readonly getSeasonMode: () => Promise<boolean>;
  readonly getDownloadsRoot: () => Promise<string>;
  readonly setDownloadsRoot: (path: string) => Promise<string>;
  readonly pickFolder: (title: string) => Promise<string>;
}
