/** Props for the flat per-anime episode list, optionally scoped to one watch cycle. */
export interface AnimeWatchEpisodeListProps {
  /** The owning anime's id, forwarded to the episodes hook as its request scope. */
  readonly animeId: string;
  /**
   * The watch cycle scoping the list; when passed, every row carries a
   * "Watch K" chip naming it. `undefined` is the All-episodes case: rows span
   * every cycle, so no chip renders.
   */
  readonly cycle?: number;
}
