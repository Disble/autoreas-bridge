/**
 * SyncingAnime is the shared DTO exposed by the runtime for a single anime that
 * still has pending bridge sync work.
 */
export interface SyncingAnime {
  readonly animeId: string;
  readonly title: string;
  readonly changeType: string;
  readonly pendingChanges: number;
  readonly changedFields: ReadonlyArray<string>;
  readonly progressCurrent?: number;
  readonly progressTotal?: number;
  readonly lastChangedAtMs: number;
  readonly active: number;
}
