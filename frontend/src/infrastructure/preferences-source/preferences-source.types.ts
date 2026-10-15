/**
 * Preferences request/reply port for settings owned by the desktop runtime.
 */
export interface PreferencesSource {
  readonly getSeasonMode: () => Promise<boolean>;
  readonly getLibraryRoot: () => Promise<string>;
  readonly setLibraryRoot: (path: string) => Promise<string>;
  readonly pickFolder: (title: string) => Promise<string>;
  readonly getAutoStartEnabled: () => Promise<boolean>;
  readonly setAutoStartEnabled: (enabled: boolean) => Promise<string>;
  readonly getKeymap: () => Promise<string>;
  readonly setKeymap: (document: string) => Promise<string>;
}
