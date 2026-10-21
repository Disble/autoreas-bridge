/** What a change line needs to be worded: who wrote it, what it did and its stored snapshots. */
export interface ActivityChangeWordsInput {
  /** Who wrote it: `mobile`, `desktop`, `system`. */
  readonly source: string;
  /** Domain action, such as `episode_adjusted`. */
  readonly actionType: string;
  /** Snapshot JSON before the write; empty or `{}` when there was none. */
  readonly beforeJson: string;
  /** Snapshot JSON after the write. */
  readonly afterJson: string;
}
