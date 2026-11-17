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
}

/**
 * Port of the Settings page's bindings, served by the `settings` module: the
 * library root (read, change preview, save), the Windows auto-start
 * preference and the keymap document (read at startup by the keyboard
 * dispatcher, written by the Shortcuts panel). Every call rejects with a `BridgeError` whose message is the plain
 * text the UI shows, except `pickFolder` (an always-ready shell binding), which
 * reads a failed dialog as a cancel (''), as every folder picker does.
 */
export interface SettingsSource {
  readonly getLibraryRoot: () => Promise<string>;
  readonly setLibraryRoot: (path: string) => Promise<void>;
  readonly previewLibraryRootChange: (path: string) => Promise<LibraryRootChangePreview>;
  readonly pickFolder: (title: string) => Promise<string>;
  readonly getAutoStartEnabled: () => Promise<boolean>;
  readonly setAutoStartEnabled: (enabled: boolean) => Promise<void>;
  /** The persisted keymap document, opaque here; `''` means nothing has been rebound. */
  readonly getKeymap: () => Promise<string>;
  /** Persists the keymap document verbatim; `''` clears it back to the shipped defaults. */
  readonly setKeymap: (document: string) => Promise<void>;
}
