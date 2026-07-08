/** Props for the DownloadsRootPanel; source is injectable for tests. */
export interface DownloadsRootPanelProps {
  readonly source?: DownloadsRootSource;
}

/** Runtime source used by the panel to read/persist the root and pick a folder. */
export interface DownloadsRootSource {
  readonly getDownloadsRoot: () => Promise<string>;
  readonly setDownloadsRoot: (path: string) => Promise<string>;
  readonly pickFolder: (title: string) => Promise<string>;
}
