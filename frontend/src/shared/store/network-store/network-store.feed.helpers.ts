import type { ObservabilityLogEntry } from '../../contracts/observability.types';
import type { RuntimeEventRecord } from '../../contracts/runtime-event.types';
import { NETWORK_STORE_INTERNAL_STATE } from './network-store.constants';
import type { EventPageMode, RuntimeEventRow } from './network-store.types';

/**
 * Renders any value as a stable string: object keys are sorted, so two
 * structurally equal values always canonicalize identically regardless of the
 * order their keys were built in. This is the replay reconciliation that
 * `connectNetworkStore` has always used, lifted out of its closure so the
 * overlay admission path can reuse the same algorithm instead of inventing a
 * second one.
 */
export function canonicalizeValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeValue).join(',')}]`;
  }

  const record = value as Readonly<Record<string, unknown>>;

  return `{${Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalizeValue(record[key])}`)
    .join(',')}}`;
}

/** Canonical fingerprint of one raw log entry, used for replay reconciliation. */
export function fingerprintLogEntry(entry: ObservabilityLogEntry): string {
  return canonicalizeValue(entry);
}

/**
 * Canonical fingerprint of one feed row over its semantic fields only.
 *
 * `id` is excluded deliberately: a live push is emitted before the
 * asynchronous INSERT assigns a database id, so an id-keyed comparison could
 * never match a persisted row and would duplicate every pushed event (design
 * D-4). Absent and empty optional fields normalize to the same value so the
 * two origins of a row fingerprint identically.
 */
export function fingerprintEventRow(row: Readonly<RuntimeEventRow>): string {
  return canonicalizeValue({
    occurredAtMs: row.occurredAtMs,
    domain: row.domain,
    level: row.level,
    message: row.message,
    correlationId: row.correlationId ?? '',
    entityId: row.entityId ?? '',
    eventType: row.eventType ?? '',
    durationMs: row.durationMs ?? 0,
    metadata: normalizeMetadata(row.metadata),
  });
}

/** Treats an absent and an empty metadata bag as the same value. */
function normalizeMetadata(metadata: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> {
  return metadata ?? {};
}

/**
 * Merges a freshly-fetched page into the existing persisted feed: `replace`
 * (a fresh filter set, or the first page) discards the previous rows;
 * `append` (an older cursor page) concatenates them after the existing ones.
 * Modelled on `mergeTransactionPage`. There is no entry cap here on purpose —
 * capping a cursor-paged feed deletes rows the user just paged in (D-6.2).
 */
export function mergeEventPage(
  existing: readonly RuntimeEventRow[],
  incoming: readonly RuntimeEventRow[],
  mode: EventPageMode,
): readonly RuntimeEventRow[] {
  return mode === 'append' ? [...existing, ...incoming] : incoming;
}

/** Maps one persisted runtime-event record into a feed row, keyed by its database id. */
export function toRuntimeEventRow(record: Readonly<RuntimeEventRecord>): RuntimeEventRow {
  return {
    id: `event-${record.id}`,
    occurredAtMs: record.occurredAtMs,
    domain: record.domain,
    level: record.level,
    message: record.message,
    correlationId: record.correlationId,
    entityId: record.entityId,
    eventType: record.eventType,
    durationMs: record.durationMs,
    metadata: record.metadata,
  };
}

/**
 * Maps one live-pushed log entry into a feed row. The push carries no
 * persisted id, so the row takes a synthetic one from the store's own
 * sequence; nothing downstream may treat it as a database key.
 */
export function toOverlayEventRow(entry: Readonly<ObservabilityLogEntry>): RuntimeEventRow {
  NETWORK_STORE_INTERNAL_STATE.overlaySequence += 1;

  return {
    id: `overlay-${NETWORK_STORE_INTERNAL_STATE.overlaySequence}`,
    occurredAtMs: toOccurredAtMs(entry.timestamp),
    domain: entry.domain,
    level: entry.level ?? 'info',
    message: entry.message,
    correlationId: entry.correlationId,
    entityId: entry.entityId,
    eventType: entry.eventType,
    durationMs: entry.durationMs,
    metadata: entry.metadata,
  };
}

/** Parses a log entry's timestamp into epoch milliseconds, 0 when unparseable. */
function toOccurredAtMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);

  return Number.isNaN(parsed) ? 0 : parsed;
}
