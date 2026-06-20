/**
 * ObservabilityLogEntry is the pure DTO for a single structured runtime log
 * entry streamed from the backend (mirrors `internal/logger/logger.go`'s
 * `LogEntry`/`Fields`). This contract has zero imports and zero behavior — it
 * is the shared shape consumed by `infrastructure/`, `shared/store/`, and
 * every feature that renders log/network data.
 */
export interface ObservabilityLogEntry {
  readonly timestamp: string;
  readonly domain: string;
  readonly level?: string;
  readonly message: string;
  readonly correlationId?: string;
  readonly entityId?: string;
  readonly eventType?: string;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
