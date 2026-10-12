/** PROTOTYPE — disposable, NOT PRODUCTION. Episode-recognition triage PoC types. */
export interface ObservedEntry {
  /** Absolute or case-relative path (display only). */
  readonly path: string;
  /** File basename with extension. */
  readonly basename: string;
  /** Size in bytes serialized as string (bigint-safe). */
  readonly sizeBytes: string | null;
  /** Windows creation time, nanoseconds since epoch, serialized as string. Null when unavailable. */
  readonly birthNs: string | null;
  /** Modification time, nanoseconds since epoch, serialized as string. Null when unavailable. */
  readonly mtimeNs: string | null;
  /** Optional explicit episode tags (e.g. ffprobe tags). Evaluated as field claims. */
  readonly episodeTags?: readonly string[];
  /** Optional ffprobe duration seconds. Null = unavailable, never zero-filled. */
  readonly durationSec?: number | null;
  /** Human-readable acquisition problems. */
  readonly errors?: readonly string[];
  /** True when before/after stat disagreed. */
  readonly changedBetweenStats?: boolean;
}

export interface CollectionConvention {
  /** Rank=>episode mapping allowed only when all three hold. */
  readonly completePrefixFrom1: boolean;
  readonly noGaps: boolean;
  readonly noExtras: boolean;
  /** Short label shown in reports, e.g. "explicit-initial-prefix". */
  readonly label: string;
}

export interface SnapshotContext {
  readonly animeTitle?: string;
  /** Integer next episode the user expects, or fractional progress marker. */
  readonly expectedNext?: number | string;
  /** Watched progress marker; may be fractional. */
  readonly progress?: number | string;
  /** Free-form note, e.g. "historical demo context, not live DB". */
  readonly note?: string;
}

export interface Snapshot {
  readonly source: "live" | "synthetic" | "replay";
  readonly capturedAt: string;
  readonly entries: readonly ObservedEntry[];
  /** Null = unknown collection; never silently treated as prefix. */
  readonly convention: CollectionConvention | null;
  readonly context?: SnapshotContext;
  readonly notes?: string;
}

export type Verdict =
  | "corroborated"
  | "conditional"
  | "conflicting"
  | "ambiguous"
  | "unresolved";

export interface EntryResult {
  readonly basename: string;
  readonly verdict: Verdict;
  /** Accepted ordinary episode under convention; absent when ambiguous/conflicting. */
  readonly episode?: number;
  /** Compatible alternatives kept visible instead of arbitrary selection. */
  readonly alternatives?: readonly number[];
  readonly support: readonly string[];
  readonly contradictions: readonly string[];
  readonly assumptions: readonly string[];
  readonly sources: readonly string[];
  readonly birthRank?: string;
  readonly mtimeRank?: string;
  readonly labelSummary?: string;
}

export interface TriageResult {
  readonly scenarioId: string;
  readonly verdicts: readonly EntryResult[];
  readonly globalNotes: readonly string[];
  readonly globalAssumptions: readonly string[];
  /** Ordinal=>basename accepted ordinary assignments (one-to-one). */
  readonly assignments: Readonly<Record<string, string>>;
  readonly pendingCompatibility: readonly string[];
  /**
   * Actual requested next file, ALWAYS explicit. Selected AFTER global
   * reconciliation, only from valid provided context / derived exact integer
   * progress (never truncated fractional). Null means abstention: unknown or
   * fractional progress, unassigned next ordinal, unstable file, or a
   * contested ordinal suspended by reconciliation. Identity assignments and
   * next selection are different decisions: a recognized file13 with null
   * selection abstains.
   */
  readonly nextSelection: { readonly episode: number; readonly basename: string } | null;
  /** Human-readable basis for the selection, or the no-selection reason. */
  readonly nextReason: string;
}
