/**
 * Frontend mirror of `internal/api/contracts/event.go`'s DTOs (design.md D-1,
 * "Interfaces / Contracts"). Response field names follow the Go structs' JSON
 * tags (camelCase); `RuntimeEventQuery` is the app-facing request shape the
 * infrastructure adapter maps into the Wails binding's wire request, which has
 * no JSON tags and therefore uses the raw Go field names.
 *
 * This is the persisted runtime-event store's shape — the same rows the
 * request-capture MCP's `search_events` reads. It is deliberately separate
 * from `observability.types.ts`, which describes the in-process live push and
 * carries no persisted id.
 */

/** The filter set both runtime-event reads accept; every populated field composes as AND. */
export interface RuntimeEventFilters {
  readonly domain?: string;
  readonly level?: string;
  readonly eventType?: string;
  readonly correlationId?: string;
  readonly entityId?: string;
  readonly text?: string;
  readonly startMs?: number;
  readonly endMs?: number;
}

/** App-facing request for SearchRuntimeEvents: the filters plus keyset pagination. */
export interface RuntimeEventQuery {
  readonly limit?: number;
  readonly cursor?: string;
  readonly filters?: RuntimeEventFilters;
}

/** One persisted runtime event as the frontend receives it, `id` assigned at INSERT. */
export interface RuntimeEventRecord {
  readonly id: number;
  readonly occurredAtMs: number;
  readonly domain: string;
  readonly level: string;
  readonly message: string;
  readonly correlationId?: string;
  readonly entityId?: string;
  readonly eventType?: string;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * One newest-first SearchRuntimeEvents page. `items` is always a non-null
 * array. `available` and `degraded` are distinct on purpose: `available:
 * false` means this database predates the runtime-event table, while
 * `degraded: true` means the read itself failed.
 */
export interface RuntimeEventPage {
  readonly items: readonly RuntimeEventRecord[];
  readonly nextCursor?: string;
  readonly appliedLimit: number;
  readonly malformedRowsSkipped: number;
  readonly warningCount: number;
  readonly available: boolean;
  readonly degraded: boolean;
}

/** One aggregation bucket of a summary grouping dimension. */
export interface RuntimeEventCountGroup {
  readonly key: string;
  readonly count: number;
}

/** One bounded newest-matching-event sample carried by a summary result. */
export interface RuntimeEventSample {
  readonly id: number;
  readonly occurredAtMs: number;
  readonly domain: string;
  readonly level: string;
  readonly message: string;
}

/**
 * One SummarizeRuntimeEvents result: three independent groupings plus the
 * newest matching samples, from a single reader call. All four slices are
 * non-null, so an empty match is a zeroed aggregation rather than a null.
 */
export interface RuntimeEventSummary {
  readonly byDomain: readonly RuntimeEventCountGroup[];
  readonly byLevel: readonly RuntimeEventCountGroup[];
  readonly byEventType: readonly RuntimeEventCountGroup[];
  readonly samples: readonly RuntimeEventSample[];
  readonly available: boolean;
  readonly degraded: boolean;
}
