/** Props accepted by the syncing-anime panel. */
export interface SyncingAnimePanelProps {
  readonly refreshToken: number;
}

/** Supported semantic color tones for the change-type badge. */
export type SyncingAnimePanelTone = 'default' | 'success' | 'warning' | 'danger';

/** Render-ready model exposed by the panel hook. */
export interface SyncingAnimePanelViewModel {
  readonly animeId: string;
  readonly title: string;
  readonly changeLabel: string;
  readonly changeTone: SyncingAnimePanelTone;
  readonly queueLabel: string;
  readonly progressLabel: string | null;
  readonly changedFields: ReadonlyArray<string>;
  readonly lastUpdatedLabel: string;
}
