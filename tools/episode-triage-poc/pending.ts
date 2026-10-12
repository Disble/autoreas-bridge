/** PROTOTYPE — disposable, NOT PRODUCTION. Pure pending-first helpers. */
import type { ObservedEntry, SnapshotContext } from "./types.ts";

/**
 * Exact integer watched progress, or null. Fractional or string progress
 * never truncates into an ordinal; negative progress is unusable.
 */
export function integerProgress(ctx: SnapshotContext | undefined): number | null {
  if (ctx === undefined) return null;
  const p = ctx.progress;
  if (typeof p === "number" && Number.isInteger(p) && p >= 0) return p;
  return null;
}

/**
 * Usable next ordinal enforced by the core itself: an explicit positive
 * integer expectedNext wins, otherwise exact integer progress implies
 * progress+1. Fractional or string context never yields an ordinal.
 */
export function usableNext(ctx: SnapshotContext | undefined): number | null {
  if (ctx === undefined) return null;
  const e = ctx.expectedNext;
  if (typeof e === "number" && Number.isInteger(e) && e > 0) return e;
  const p = integerProgress(ctx);
  return p === null ? null : p + 1;
}

/**
 * Supplied-but-unusable expected-next disclosure: returns the raw token when
 * a context carries expectedNext that is NOT a usable positive integer
 * (string, fractional, zero/negative, boolean, ...). Absent or usable
 * tokens yield null, so clean runs never mention an unusable token. An
 * unusable token carries no ordinal information: the core still derives
 * from exact integer progress+1, and the caller must disclose that the
 * token was present but not used.
 */
export function unusableExpectedNext(ctx: SnapshotContext | undefined): unknown {
  if (ctx === undefined) return null;
  if (!Object.prototype.hasOwnProperty.call(ctx, "expectedNext")) return null;
  const e: unknown = ctx.expectedNext;
  if (e === undefined || e === null) return null;
  if (typeof e === "number" && Number.isInteger(e) && e > 0) return null;
  return e;
}

/** Capture problems bar acceptance and ranking; healthy files are unaffected. */
export function isReliable(e: ObservedEntry): boolean {
  return e.changedBetweenStats !== true && (e.errors?.length ?? 0) === 0;
}

/** True when a clear ordinal is already-watched context under progress. */
export function isWatchedOrdinal(ordinal: number, progress: number | null): boolean {
  return progress !== null && ordinal <= progress;
}

/** Minimal timestamp view for pending-order comparison. */
export interface PendingStamp {
  readonly basename: string;
  readonly birthNs: string | null;
  readonly mtimeNs: string | null;
}

/**
 * Elimination inference: exactly one opaque pending file beside identified
 * numbered pending siblings, with the usable next ordinal claimed by nobody.
 * Returns the episode the opaque file may conditionally claim, else null.
 * A lone opaque file with no numbered pending siblings has no elimination
 * basis; a next ordinal already claimed by a numbered file is not inferred.
 */
export function inferElimination(
  opaquePendingCount: number,
  numberedPendingCount: number,
  next: number | null,
  nextClaimed: boolean,
): number | null {
  if (opaquePendingCount !== 1) return null;
  if (numberedPendingCount < 1) return null;
  if (next === null || nextClaimed) return null;
  return next;
}

/**
 * Single-pending elimination by a complete watched prefix: exactly one
 * remaining pending file (itself opaque-eligible) may conditionally claim
 * the usable next when integer progress exists, an explicit expected-next
 * (when present) agrees with progress+1, and the already-watched files
 * account for every ordinal 1..progress exactly once. A lone file without
 * usable watched context never qualifies; a gap, a duplicate, or an
 * expectedNext/progress contradiction abstains. Returns the episode the lone
 * file may conditionally claim, else null.
 */
export function inferSinglePendingElimination(
  totalPending: number,
  opaquePending: number,
  next: number | null,
  nextClaimed: boolean,
  progress: number | null,
  expectedNext: unknown,
  watchedEpisodes: readonly number[],
): number | null {
  if (totalPending !== 1 || opaquePending !== 1) return null;
  if (next === null || nextClaimed) return null;
  if (progress === null || progress < 1) return null;
  if (
    typeof expectedNext === "number" && Number.isInteger(expectedNext) && expectedNext > 0 &&
    expectedNext !== progress + 1
  ) return null;
  if (watchedEpisodes.length !== progress) return null;
  const seen = new Set(watchedEpisodes);
  if (seen.size !== progress) return null;
  for (let o = 1; o <= progress; o++) if (!seen.has(o)) return null;
  return next;
}

/**
 * Relative pending chronology: earliest-first basenames when every pending
 * file is opaque, all births are present/distinct/reliable, all mtimes are
 * present, and modification order agrees with creation order. Watched files
 * never take part, so a watched recreation cannot shift pending order.
 * Ties, unknowns, or an inverted pair yield null: no lexical winner.
 */
export function inferChronologyOrder(
  pending: readonly PendingStamp[],
  reliable: (basename: string) => boolean,
): readonly string[] | null {
  if (pending.length < 2) return null;
  for (const f of pending) {
    if (!reliable(f.basename)) return null;
    if (f.birthNs === null || f.mtimeNs === null) return null;
  }
  const births = new Set(pending.map((f) => f.birthNs as string));
  if (births.size !== pending.length) return null;
  const byBirth = [...pending].sort((a, b) => {
    const x = BigInt(a.birthNs as string);
    const y = BigInt(b.birthNs as string);
    if (x !== y) return x < y ? -1 : 1;
    return a.basename < b.basename ? -1 : 1;
  });
  for (let i = 1; i < byBirth.length; i++) {
    if (BigInt(byBirth[i].mtimeNs as string) <= BigInt(byBirth[i - 1].mtimeNs as string)) return null;
  }
  return byBirth.map((f) => f.basename);
}

/**
 * Actual next selection AFTER reconciliation: the usable next ordinal must
 * name a published, stable, known, reliable, unwatched file. A watched
 * target abstains for manual review; never falls back to a nearby ordinal
 * merely because the requested one is watched or missing.
 */
export function selectNext(
  assignments: Readonly<Record<string, string>>,
  next: number | null,
  reliable: (basename: string) => boolean,
  isWatched?: (basename: string) => boolean,
): { readonly episode: number; readonly basename: string } | null {
  if (next === null) return null;
  const base = assignments[String(next)] ?? null;
  if (base === null || !reliable(base)) return null;
  if (isWatched?.(base) === true) return null;
  return { episode: next, basename: base };
}
