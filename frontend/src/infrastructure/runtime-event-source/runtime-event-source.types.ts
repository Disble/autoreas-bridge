import type { ObservabilityLogEntry } from '../../shared/contracts/observability.types';
import type {
  RuntimeEventFilters,
  RuntimeEventPage,
  RuntimeEventQuery,
  RuntimeEventSummary,
} from '../../shared/contracts/runtime-event.types';

/**
 * In-process read source over the bridge's persisted runtime-event store,
 * backed by the Wails-bound `SearchRuntimeEvents`/`SummarizeRuntimeEvents`
 * methods (design D-1). It is the desktop peer of the request-capture MCP's
 * delegating adapter: one query engine, two adapters, two processes.
 *
 * `subscribe` is the live push that overlays the persisted page. Its payload
 * is an `ObservabilityLogEntry`, not a persisted record, because the fanout
 * logger emits it before the asynchronous INSERT assigns a database id — so it
 * deliberately carries no id to key on (design D-4).
 *
 * Both reads degrade to an unavailable/zeroed `degraded: true` result rather
 * than rejecting when the bindings are not yet attached.
 */
export interface RuntimeEventSource {
  readonly searchEvents: (query: RuntimeEventQuery) => Promise<RuntimeEventPage>;
  readonly summarizeEvents: (filters: RuntimeEventFilters) => Promise<RuntimeEventSummary>;
  readonly subscribe: (listener: (entry: ObservabilityLogEntry) => void) => () => void;
}
