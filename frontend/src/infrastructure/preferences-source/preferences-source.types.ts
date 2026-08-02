/**
 * Preferences request/reply port for settings owned by the desktop runtime.
 */
export interface PreferencesSource {
  readonly getSeasonMode: () => Promise<boolean>;
  readonly getDownloadsRoot: () => Promise<string>;
  readonly setDownloadsRoot: (path: string) => Promise<string>;
  readonly pickFolder: (title: string) => Promise<string>;
  readonly getAutoStartEnabled: () => Promise<boolean>;
  readonly setAutoStartEnabled: (enabled: boolean) => Promise<string>;
}
