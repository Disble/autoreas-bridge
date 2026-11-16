/**
 * Preferences request/reply port for settings owned by the desktop runtime,
 * kept for the consumers that have not moved to `useBridgeQuery` yet (season
 * mode, the library root read by anime create and season intake, the folder
 * picker and the keymap). The Settings page reads through `SettingsSource`.
 */
export interface PreferencesSource {
  readonly getSeasonMode: () => Promise<boolean>;
  readonly getLibraryRoot: () => Promise<string>;
  readonly pickFolder: (title: string) => Promise<string>;
  readonly getKeymap: () => Promise<string>;
  readonly setKeymap: (document: string) => Promise<string>;
}
