/** Props for the flat per-anime episode list, optionally scoped to one watch cycle. */
export interface AnimeWatchEpisodeListProps {
  /** The owning anime's id, forwarded to the episodes hook as its request scope. */
  readonly animeId: string;
  /**
   * The watch cycle scoping the list; when passed, every row's chip names it.
   * `undefined` is the All-episodes case: each row's chip names that row's
   * own stored cycle instead.
   */
  readonly cycle?: number;
  /**
   * Gates the backing fetch; a collapsed Accordion item renders disabled so
   * it pays no binding call until it expands. Defaults to true.
   */
  readonly enabled?: boolean;
}
