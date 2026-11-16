import type { AnimeCoverEntry } from "../../../../shared/anime-cover/use-anime-cover";
import type { AnimeDetail, WatchHistoryEntry, WatchHistoryPage } from "../../../../shared/contracts/anime.types";
import type { AsyncViewSource } from "../../../../shared/query/async-view/async-view.types";

/** Props accepted by the `HistoryInspector` panel. */
export interface HistoryInspectorProps {
  /** The selected anime ID from the URL, or `undefined` when no row is selected. */
  readonly animeId: string | undefined;
  /** Opens the anime detail of the inspected anime. */
  readonly onOpenAnime: (animeId: string) => void;
}

/** Props accepted by the `useHistoryInspector` hook. */
export interface HistoryInspectorHookProps {
  /** The selected anime ID from the URL, or `undefined` when no row is selected. */
  readonly animeId: string | undefined;
}

/** One inspector query as the inspector reads it (a `useBridgeQuery` result fits it). */
export type HistoryInspectorRead<TData> = AsyncViewSource<TData> & {
  /** True while the previous anime's answer is still shown for a new selection. */
  readonly isPlaceholderData: boolean;
};

/** Everything `toHistoryInspectorState` reads. */
export interface HistoryInspectorStateInput {
  /** The selected anime ID, or `undefined` when no row is selected. */
  readonly animeId: string | undefined;
  /** The selected anime's detail query. */
  readonly detail: HistoryInspectorRead<AnimeDetail>;
  /** The selected anime's 3-row recent-episodes page query. */
  readonly recent: HistoryInspectorRead<WatchHistoryPage>;
  readonly cover: AnimeCoverEntry;
}

/** Exclusive inspector states (design D8). */
export type HistoryInspectorStatus = "prompt" | "loading" | "error" | "content";

/** State returned by `useHistoryInspector`. */
export interface HistoryInspectorState {
  /** The exclusive inspector state (design D8). */
  readonly status: HistoryInspectorStatus;
  /** The current anime's detail once its own snapshot resolved; `undefined` while stale or prompt. */
  readonly detail: AnimeDetail | undefined;
  /** `repetitions[0]?.createdAt ?? createdAt`, since a repeat resets `createdAt` (design D8). */
  readonly addedMs: number | undefined;
  /** The newest recent row, falling back to `lastWatchedAt` (design D8). */
  readonly lastWatchedMs: number | undefined;
  /** Cover resolution from the shared `useAnimeCover` (design D1): placeholder until a stored path is known. */
  readonly cover: AnimeCoverEntry;
  /** The 3 most recent watch rows for the anime (design D8); empty while unresolved or on a page failure. */
  readonly recentEpisodes: readonly WatchHistoryEntry[];
}
