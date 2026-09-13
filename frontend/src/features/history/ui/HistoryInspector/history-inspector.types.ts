import type { AnimeDetail, WatchHistoryEntry } from "../../../../shared/contracts/anime.types";

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
  /** Recent watch rows for the anime; the newest one owns "Last watched" (design D8). U10 wires the 3-row page here. */
  readonly recentRows?: readonly WatchHistoryEntry[];
}

/** One in-flight detail read, keyed by the `animeId` that requested it. */
export interface HistoryInspectorSnapshot {
  /** The `animeId` that requested this snapshot. */
  readonly animeId: string;
  /** The resolved detail, or `null` when it failed or is missing. */
  readonly detail: AnimeDetail | null;
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
}
