/**
 * Minimal read-only shape for the Daily-schedule membership predicate: an anime
 * belongs to the Daily board when it is active and carries at least one
 * scheduled weekday. Lives here so the predicate can operate on any record that
 * exposes `active` plus its `days` placements without importing the full DTO.
 */
export interface AnimeScheduleMembership {
  readonly active: number;
  readonly days: readonly string[];
}
