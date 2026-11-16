import type { SyncingAnime } from '../../../../shared/contracts/syncing-anime.types';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';

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

/** The pending-sync query state the panel view is derived from (a `useBridgeQuery` result fits it). */
export interface SyncingAnimeQueryState {
  readonly status: 'pending' | 'error' | 'success';
  readonly data: readonly SyncingAnime[] | undefined;
  readonly error: unknown;
  readonly isFetching: boolean;
  /** True while a new refresh token's key shows the previous read's items. */
  readonly isPlaceholderData: boolean;
}

/** The one state the panel renders: loading, failure, empty or the render-ready items. */
export type SyncingAnimePanelView = AsyncView<readonly SyncingAnimePanelViewModel[]>;
