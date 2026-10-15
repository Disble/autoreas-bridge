/** One active anime whose saved folder follows a library root change (Go anime.LibraryRootMove). */
export interface LibraryRootMove {
  readonly animeId: string;
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly baseModifiedAt: number;
}

/** One active anime outside the old library root, left as it is (Go anime.LibraryRootKept). */
export interface LibraryRootKept {
  readonly animeId: string;
  readonly name: string;
  readonly folder: string;
}

/** What saving a new library root would do to saved folders (Go LibraryRootChangePreview). */
export interface LibraryRootChangePreview {
  readonly oldRoot: string;
  readonly moves: readonly LibraryRootMove[];
  readonly kept: readonly LibraryRootKept[];
  readonly message?: string;
}

/**
 * Preferences request/reply port for settings owned by the desktop runtime.
 */
export interface PreferencesSource {
  readonly getSeasonMode: () => Promise<boolean>;
  readonly getLibraryRoot: () => Promise<string>;
  readonly setLibraryRoot: (path: string) => Promise<string>;
  readonly previewLibraryRootChange: (path: string) => Promise<LibraryRootChangePreview>;
  readonly pickFolder: (title: string) => Promise<string>;
  readonly getAutoStartEnabled: () => Promise<boolean>;
  readonly setAutoStartEnabled: (enabled: boolean) => Promise<string>;
  readonly getKeymap: () => Promise<string>;
  readonly setKeymap: (document: string) => Promise<string>;
}
