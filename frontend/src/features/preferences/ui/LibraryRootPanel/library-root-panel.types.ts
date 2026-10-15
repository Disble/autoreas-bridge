/** Props for the LibraryRootPanel; source is injectable for tests. */
export interface LibraryRootPanelProps {
  readonly source?: LibraryRootSource;
}

/** Runtime source used by the panel to read/persist the root and pick a folder. */
export interface LibraryRootSource {
  readonly getLibraryRoot: () => Promise<string>;
  readonly setLibraryRoot: (path: string) => Promise<string>;
  readonly pickFolder: (title: string) => Promise<string>;
}
