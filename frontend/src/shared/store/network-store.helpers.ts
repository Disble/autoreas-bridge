import type { ObservabilityLogEntry } from '../contracts/observability.types';
import type { NetworkRequestRow, NetworkStatusFilter } from './network-store.types';

let perEntrySequence = 0;
const perEntryIdByEntry = new WeakMap<ObservabilityLogEntry, string>();

/**
 * keepRecent caps a buffer to its last `max` entries, preserving order
 * (oldest first, newest last). Pure — never mutates the input array.
 */
export function keepRecent<T>(buffer: readonly T[], max: number): readonly T[] {
  if (buffer.length <= max) {
    return buffer;
  }

  return buffer.slice(buffer.length - max);
}

/**
 * perEntryRowId returns a stable per-entry identity for log entries that do
 * not carry a `correlationId`. Per the corrected fold contract (drift
 * resolution: `http.request` events never set `correlationId`), every entry
 * without one MUST still render as its own distinct Network row rather than
 * being excluded. The identity is memoized per entry object so repeated folds
 * of the same buffer remain referentially stable and order-preserving.
 */
function perEntryRowId(entry: ObservabilityLogEntry): string {
  const existing = perEntryIdByEntry.get(entry);

  if (existing !== undefined) {
    return existing;
  }

  perEntrySequence += 1;
  const id = `__row_${perEntrySequence}`;
  perEntryIdByEntry.set(entry, id);

  return id;
}

function rowGroupKey(entry: ObservabilityLogEntry): string {
  return entry.correlationId !== undefined && entry.correlationId !== '' ? entry.correlationId : perEntryRowId(entry);
}

function readMetadataString(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = metadata?.[key];

  return typeof value === 'string' ? value : undefined;
}

function readMetadataNumber(metadata: Readonly<Record<string, unknown>> | undefined, key: string): number | undefined {
  const value = metadata?.[key];

  return typeof value === 'number' ? value : undefined;
}

interface MutableRowAccumulator {
  groupKey: string;
  method: string;
  path: string;
  status: number | null;
  durationMs: number | null;
  domain: string;
  startedAt: string;
  updatedAt: string;
  events: ObservabilityLogEntry[];
}

function applyEntryToAccumulator(accumulator: MutableRowAccumulator, entry: ObservabilityLogEntry): void {
  accumulator.method = readMetadataString(entry.metadata, 'method') ?? accumulator.method;
  accumulator.path = readMetadataString(entry.metadata, 'path') ?? accumulator.path;
  accumulator.status = readMetadataNumber(entry.metadata, 'status') ?? accumulator.status;
  accumulator.durationMs = entry.durationMs ?? accumulator.durationMs;
  accumulator.domain = entry.domain !== '' ? entry.domain : accumulator.domain;
  accumulator.updatedAt = entry.timestamp;
  accumulator.events.push(entry);
}

/**
 * foldByCorrelationId folds the raw event buffer into Network request rows.
 *
 * CORRECTED contract (drift resolution, see `sdd/.../drift-correlationid`):
 * each log entry is its own row by default (stable per-entry identity);
 * entries that share a NON-EMPTY `correlationId` fold into a single operation
 * row (dedup, last-write-wins per field, ordered by first-seen `startedAt`).
 * Entries lacking a `correlationId` are NEVER dropped — `http.request` events
 * never set one (see `internal/api/middleware.go`), so excluding them would
 * empty the Network table for all HTTP traffic.
 *
 * Pure: same input always yields an equivalent output; never mutates `buffer`.
 */
export function foldByCorrelationId(buffer: readonly ObservabilityLogEntry[]): readonly NetworkRequestRow[] {
  const order: string[] = [];
  const accumulators = new Map<string, MutableRowAccumulator>();

  for (const entry of buffer) {
    const groupKey = rowGroupKey(entry);
    const existing = accumulators.get(groupKey);

    if (existing === undefined) {
      order.push(groupKey);
      accumulators.set(groupKey, {
        groupKey,
        method: readMetadataString(entry.metadata, 'method') ?? '',
        path: readMetadataString(entry.metadata, 'path') ?? '',
        status: readMetadataNumber(entry.metadata, 'status') ?? null,
        durationMs: entry.durationMs ?? null,
        domain: entry.domain,
        startedAt: entry.timestamp,
        updatedAt: entry.timestamp,
        events: [entry],
      });
      continue;
    }

    applyEntryToAccumulator(existing, entry);
  }

  return order.map((groupKey) => {
    const accumulator = accumulators.get(groupKey) as MutableRowAccumulator;

    return {
      correlationId: accumulator.groupKey,
      method: accumulator.method,
      path: accumulator.path,
      status: accumulator.status,
      durationMs: accumulator.durationMs,
      domain: accumulator.domain,
      startedAt: accumulator.startedAt,
      updatedAt: accumulator.updatedAt,
      events: accumulator.events,
    };
  });
}

function matchesQuery(row: NetworkRequestRow, query: string): boolean {
  if (query === '') {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  return row.method.toLowerCase().includes(normalizedQuery) || row.path.toLowerCase().includes(normalizedQuery);
}

function matchesStatusFilter(row: NetworkRequestRow, statusFilter: NetworkStatusFilter): boolean {
  if (statusFilter === 'all') {
    return true;
  }

  if (statusFilter === 'pending') {
    return row.status === null;
  }

  if (statusFilter === 'success') {
    return row.status !== null && row.status >= 200 && row.status < 400;
  }

  return row.status !== null && row.status >= 400;
}

/**
 * selectFilteredRows folds the buffer then applies the free-text query and
 * status filter. Pure — safe to call on every render given the same inputs.
 */
export function selectFilteredRows(
  buffer: readonly ObservabilityLogEntry[],
  query: string,
  statusFilter: NetworkStatusFilter,
): readonly NetworkRequestRow[] {
  return foldByCorrelationId(buffer).filter((row) => matchesQuery(row, query) && matchesStatusFilter(row, statusFilter));
}

/**
 * selectRowById folds the buffer and returns the row matching `id`, or null
 * when `id` is null or no row matches (detail-panel lookup).
 */
export function selectRowById(buffer: readonly ObservabilityLogEntry[], id: string | null): NetworkRequestRow | null {
  if (id === null) {
    return null;
  }

  return foldByCorrelationId(buffer).find((row) => row.correlationId === id) ?? null;
}
