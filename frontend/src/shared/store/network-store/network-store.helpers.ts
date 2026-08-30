import { createStore } from 'zustand/vanilla';
import { observabilityLogSource } from '../../../infrastructure/observability-log-source/observability-log-source.helpers';
import type { ObservabilityLogSource } from '../../../infrastructure/observability-log-source/observability-log-source.types';
import type { ObservabilityLogEntry } from '../../contracts/observability.types';
import {
  INITIAL_EVENT_FEED_STATE,
  MAX_LOG_ENTRIES,
  NETWORK_STORE_INTERNAL_STATE,
} from './network-store.constants';
import { fingerprintLogEntry, mergeEventPage } from './network-store.feed.helpers';
import type {
  EntryWithId,
  MutableRowAccumulator,
  NetworkLevelFilter,
  NetworkRequestRow,
  NetworkStatusFilter,
  NetworkStoreState,
  RuntimeEventRow,
} from './network-store.types';

/** Vanilla backing store for the shared Network read-model. */
export const networkStore = createStore<NetworkStoreState>()((set) => ({ // eslint-disable-line dharness/role-file-shape -- the store singleton belongs beside its reducers; moving it to a sibling would invert the import between this file and the constants it reads
  ...INITIAL_EVENT_FEED_STATE,
  buffer: [],
  selectedId: null,
  query: '',
  statusFilter: 'all',
  levelFilter: 'all',
  domainFilter: 'all',
  ingest: (entry) =>
    set((state) => ({
      buffer: keepRecent([...state.buffer, entry], MAX_LOG_ENTRIES),
    })),
  seed: (entries) => set({ buffer: keepRecent(entries, MAX_LOG_ENTRIES) }),
  select: (id) => set({ selectedId: id }),
  setQuery: (query) => set({ query }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setLevelFilter: (levelFilter) => set({ levelFilter }),
  setDomainFilter: (domainFilter) => set({ domainFilter }),
  setPage: (items, nextCursor, mode) =>
    set((state) => ({
      page: mergeEventPage(state.page, items, mode),
      nextCursor,
      ...(mode === 'append' ? {} : { overlay: [], head: headOf(items) }),
    })),
  prependOverlay: (row) => set((state) => ({ overlay: [row, ...state.overlay] })),
  setLoadingMore: (isLoadingMore) => set({ isLoadingMore }),
  setAvailable: (available) => set({ available }),
  setDomainOptions: (domainOptions) => set({ domainOptions }),
}));

/**
 * Reads the admission boundary off a freshly replaced page: the newest
 * persisted row's timestamp, or null when the page is empty. Only a replace
 * re-anchors it — an appended page is strictly older, so moving the head there
 * would invalidate the outstanding cursor the overlay depends on (design D-3).
 */
function headOf(items: readonly RuntimeEventRow[]): number | null {
  return items.length === 0 ? null : items[0].occurredAtMs;
}

/** Reads the current Network store snapshot outside React render. */
export function getNetworkStoreState(): NetworkStoreState {
  return networkStore.getState();
}

/** Writes a partial Network store snapshot outside React render. */
function setNetworkStoreState(partial: Partial<NetworkStoreState>): void {
  networkStore.setState(partial);
}

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
 * not carry a `correlationId`.
 */
function perEntryRowId(entry: ObservabilityLogEntry): string {
  const existing = NETWORK_STORE_INTERNAL_STATE.perEntryIdByEntry.get(entry);

  if (existing !== undefined) {
    return existing;
  }

  NETWORK_STORE_INTERNAL_STATE.perEntrySequence += 1;
  const id = `__row_${NETWORK_STORE_INTERNAL_STATE.perEntrySequence}`;
  NETWORK_STORE_INTERNAL_STATE.perEntryIdByEntry.set(entry, id);

  return id;
}

/** Returns the key entries fold under: the correlation id, or a stable per-entry identity. */
function rowGroupKey(entry: ObservabilityLogEntry): string {
  return entry.correlationId !== undefined && entry.correlationId !== '' ? entry.correlationId : perEntryRowId(entry);
}

/** Reads one metadata field as a string, or undefined when it is absent or another type. */
function readMetadataString(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = metadata?.[key];

  return typeof value === 'string' ? value : undefined;
}

/** Reads one metadata field as a number, or undefined when it is absent or another type. */
function readMetadataNumber(metadata: Readonly<Record<string, unknown>> | undefined, key: string): number | undefined {
  const value = metadata?.[key];

  return typeof value === 'number' ? value : undefined;
}

/** Folds one further entry into an in-progress request row, last write winning per field. */
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

/** Reports whether a folded row matches the free-text query over its method and path. */
function matchesQuery(row: NetworkRequestRow, query: string): boolean {
  if (query === '') {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  return row.method.toLowerCase().includes(normalizedQuery) || row.path.toLowerCase().includes(normalizedQuery);
}

/** Reports whether a folded row's status falls in the selected status bucket. */
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

/** Reports whether a raw entry matches the free-text query over message, domain, event type, and path. */
function matchesEntryQuery(entry: ObservabilityLogEntry, query: string): boolean {
  if (query === '') {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  const path = readMetadataString(entry.metadata, 'path') ?? '';

  return (
    entry.message.toLowerCase().includes(normalizedQuery) ||
    entry.domain.toLowerCase().includes(normalizedQuery) ||
    (entry.eventType ?? '').toLowerCase().includes(normalizedQuery) ||
    path.toLowerCase().includes(normalizedQuery)
  );
}

/** Reports whether a raw entry's level matches the selected level filter, defaulting to info. */
function matchesEntryLevelFilter(entry: ObservabilityLogEntry, levelFilter: NetworkLevelFilter): boolean {
  if (levelFilter === 'all') {
    return true;
  }

  const level = (entry.level ?? 'info').toLowerCase();

  return level === levelFilter;
}

/** Reports whether a raw entry's domain matches the selected domain filter. */
function matchesEntryDomainFilter(entry: ObservabilityLogEntry, domainFilter: string): boolean {
  if (domainFilter === 'all') {
    return true;
  }

  return entry.domain.toLowerCase() === domainFilter.toLowerCase();
}

/**
 * selectEntryViewRows returns one row per raw log entry, filtered by query,
 * level, and domain.
 */
export function selectEntryViewRows(
  buffer: readonly ObservabilityLogEntry[],
  query: string,
  levelFilter: NetworkLevelFilter,
  domainFilter: string = 'all',
): readonly EntryWithId[] {
  const rows: EntryWithId[] = [];

  for (const entry of buffer) {
    if (
      matchesEntryQuery(entry, query) &&
      matchesEntryLevelFilter(entry, levelFilter) &&
      matchesEntryDomainFilter(entry, domainFilter)
    ) {
      rows.push({ id: perEntryRowId(entry), entry });
    }
  }

  return rows;
}

/**
 * selectEntryById returns the raw log entry whose stable per-entry id matches `id`.
 */
export function selectEntryById(buffer: readonly ObservabilityLogEntry[], id: string | null): ObservabilityLogEntry | null {
  if (id === null) {
    return null;
  }

  return buffer.find((entry) => perEntryRowId(entry) === id) ?? null;
}

/**
 * connectNetworkStore wires an observability log source into the store as a
 * single bridge and is idempotent across multiple consumers.
 */
export function connectNetworkStore(source: ObservabilityLogSource = observabilityLogSource): () => void {
  if (NETWORK_STORE_INTERNAL_STATE.bridgeUnsubscribe !== null) {
    NETWORK_STORE_INTERNAL_STATE.bridgeConsumerCount += 1;
    let disconnected = false;

    return () => {
      if (disconnected) {
        return;
      }

      disconnected = true;
      NETWORK_STORE_INTERNAL_STATE.bridgeConsumerCount -= 1;
      if (NETWORK_STORE_INTERNAL_STATE.bridgeConsumerCount === 0) {
        NETWORK_STORE_INTERNAL_STATE.bridgeUnsubscribe?.();
      }
    };
  }

  const { ingest, seed } = getNetworkStoreState();
  const liveBeforeReplay: ObservabilityLogEntry[] = [];
  const replayFingerprintCounts = new Map<string, number>();
  let active = true;
  let replayResolved = false;
  const fingerprint = fingerprintLogEntry;
  const consumeReplayMatch = (entry: ObservabilityLogEntry): boolean => {
    const key = fingerprint(entry);
    const remaining = replayFingerprintCounts.get(key) ?? 0;

    if (remaining === 0) {
      return false;
    }

    if (remaining === 1) {
      replayFingerprintCounts.delete(key);
    } else {
      replayFingerprintCounts.set(key, remaining - 1);
    }

    return true;
  };
  const ingestLive = (entry: ObservabilityLogEntry): void => {
    if (!replayResolved) {
      liveBeforeReplay.push(entry);
      ingest(entry);
      return;
    }

    if (!consumeReplayMatch(entry)) {
      ingest(entry);
    }
  };

  void source.getRecentLogs().then((entries) => {
    if (!active) {
      return;
    }

    for (const replayEntry of entries) {
      const key = fingerprint(replayEntry);
      replayFingerprintCounts.set(key, (replayFingerprintCounts.get(key) ?? 0) + 1);
    }

    const distinctLiveEntries = liveBeforeReplay.filter((entry) => !consumeReplayMatch(entry));
    seed([...entries, ...distinctLiveEntries]);
    replayResolved = true;
  });
  const unsubscribe = source.subscribe(ingestLive);

  NETWORK_STORE_INTERNAL_STATE.bridgeUnsubscribe = () => {
    active = false;
    unsubscribe();
    NETWORK_STORE_INTERNAL_STATE.bridgeConsumerCount = 0;
    NETWORK_STORE_INTERNAL_STATE.bridgeUnsubscribe = null;
  };
  NETWORK_STORE_INTERNAL_STATE.bridgeConsumerCount = 1;
  let disconnected = false;

  return () => {
    if (disconnected) {
      return;
    }

    disconnected = true;
    NETWORK_STORE_INTERNAL_STATE.bridgeConsumerCount -= 1;
    if (NETWORK_STORE_INTERNAL_STATE.bridgeConsumerCount === 0) {
      NETWORK_STORE_INTERNAL_STATE.bridgeUnsubscribe?.();
    }
  };
}

/**
 * resetNetworkStore tears down the bridge and clears state so tests start clean.
 */
export function resetNetworkStore(): void {
  if (NETWORK_STORE_INTERNAL_STATE.bridgeUnsubscribe !== null) {
    NETWORK_STORE_INTERNAL_STATE.bridgeUnsubscribe();
  }

  setNetworkStoreState({
    ...INITIAL_EVENT_FEED_STATE,
    buffer: [],
    selectedId: null,
    query: '',
    statusFilter: 'all',
    levelFilter: 'all',
    domainFilter: 'all',
  });
}
