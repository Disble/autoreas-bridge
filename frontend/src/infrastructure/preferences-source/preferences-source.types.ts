/**
 * Preferences request/reply port for settings owned by the desktop runtime,
 * kept for the consumers that have not moved to `useBridgeQuery` yet (season
 * mode, the library root read by anime create and season intake, and the
 * folder picker). The Settings page and the keymap read through `SettingsSource`.
 */
export interface PreferencesSource {
  readonly getSeasonMode: () => Promise<boolean>;
  readonly getLibraryRoot: () => Promise<string>;
  readonly pickFolder: (title: string) => Promise<string>;
}
