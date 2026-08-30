import { formatLocalDateTime, formatLocalTime } from '../../../../shared/datetime/datetime.helpers';
import {
  NETWORK_EMPTY_LABEL,
  NETWORK_EMPTY_STATE_MESSAGE,
  NETWORK_EVENTS_DEGRADED_MESSAGE,
  NETWORK_EVENTS_UNAVAILABLE_MESSAGE,
  NETWORK_HTTP_EVENT_TYPE,
  NETWORK_LEVEL_ACCENT_BORDER_CLASS,
  NETWORK_LOADING_STATE_MESSAGE,
} from './network-panel.constants';
import type { NetworkPanelSelection, NetworkPanelSummary } from './network-panel-selection.types';
import type {
  HeroChipColor,
  NetworkDetailViewModel,
  NetworkEntryViewModel,
  NetworkTraceEntryViewModel,
  RuntimeEventRow,
} from './network-panel.types';

/**
 * Formats a persisted event's epoch millis as a local-timezone `HH:MM:SS`,
 * delegating to the shared {@link formatLocalTime} so all bridge times render
 * in the computer's own timezone rather than the backend's UTC.
 */
function formatNetworkTime(occurredAtMs: number): string {
  return formatLocalTime(new Date(occurredAtMs).toISOString());
}

/**
 * Resolves the event's level, defaulting to "info" when absent. Non-HTTP
 * domain events always carry a meaningful level and must never be reduced to
 * a fabricated HTTP-style status.
 */
export function getNetworkLevelLabel(level: string | undefined): string {
  return level ?? 'info';
}

/**
 * Maps a log level to the project's semantic HeroUI chip color, mirroring
 * `ObservabilityPanel`'s `getLogLevelColor` so the Network view uses the same
 * palette as the rest of the app.
 */
export function getNetworkLevelColor(level: string | undefined): HeroChipColor {
  switch (getNetworkLevelLabel(level).toLowerCase()) {
    case 'info':
      return 'success';
    case 'warn':
      return 'warning';
    case 'error':
      return 'danger';
    case 'debug':
      return 'accent';
    default:
      return 'default';
  }
}

/**
 * Maps a runtime domain to the project's semantic HeroUI chip color,
 * mirroring `ObservabilityPanel`'s `getDomainColor` so domain tags match
 * across the dashboard and the Network tab.
 */
export function getNetworkDomainColor(domain: string): HeroChipColor {
  switch (domain.toLowerCase()) {
    case 'sync':
      return 'accent';
    case 'bus':
      return 'default';
    case 'websocket':
      return 'warning';
    case 'anime':
      return 'success';
    case 'api':
      return 'danger';
    default:
      return 'default';
  }
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

/**
 * Resolves the MESSAGE column: the event's own message, or `METHOD path`
 * when the event is an `http.request` event. Non-HTTP events always keep
 * their original message — they are never reduced to a placeholder.
 */
function getNetworkMessage(row: Readonly<RuntimeEventRow>): string {
  if (row.eventType === NETWORK_HTTP_EVENT_TYPE) {
    const method = readMetadataString(row.metadata, 'method') ?? '';
    const path = readMetadataString(row.metadata, 'path') ?? '';

    return `${method} ${path}`.trim();
  }

  return row.message;
}

/**
 * Formats the STATUS column from `metadata.status` when it is a number, or
 * the Null Object em-dash otherwise. Domain events with no HTTP status must
 * never render a fabricated "pending" value.
 */
export function getNetworkStatusLabel(status: number | undefined): string {
  if (status === undefined) {
    return NETWORK_EMPTY_LABEL;
  }

  return String(status);
}

/**
 * Formats the DURATION column in milliseconds, or the Null Object em-dash
 * when no duration was recorded.
 */
export function formatNetworkDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return NETWORK_EMPTY_LABEL;
  }

  return `${durationMs}ms`;
}

/**
 * Maps one persisted or overlaid feed row into the Network table's per-row
 * view-model. Each row becomes exactly one table row — domain events keep
 * their message and level; `http.request` events render as `METHOD path`
 * with a real status/duration when present.
 */
export function toNetworkEntryViewModel(row: Readonly<RuntimeEventRow>): NetworkEntryViewModel {
  return {
    id: row.id,
    timeLabel: formatNetworkTime(row.occurredAtMs),
    domain: row.domain,
    level: getNetworkLevelLabel(row.level),
    message: getNetworkMessage(row),
    statusLabel: getNetworkStatusLabel(readMetadataNumber(row.metadata, 'status')),
    durationLabel: formatNetworkDuration(row.durationMs),
  };
}

/**
 * Normalizes an event's metadata into sorted key/value pairs so the
 * inspector renders a deterministic order, mirroring `ObservabilityPanel`'s
 * `getMetadataEntries`.
 */
function getNetworkMetadataEntries(row: Readonly<RuntimeEventRow>): ReadonlyArray<readonly [string, string]> {
  return Object.entries(row.metadata ?? {})
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => [key, String(value)] as const);
}

/**
 * Builds the inspector's Fields section: label/value pairs for the event's
 * own attributes (timestamp, domain, eventType, level, correlationId,
 * entityId, durationMs), each falling back to the Null Object em-dash when
 * absent.
 */
function getNetworkDetailFields(row: Readonly<RuntimeEventRow>): ReadonlyArray<readonly [string, string]> {
  return [
    ['timestamp', formatLocalDateTime(new Date(row.occurredAtMs).toISOString())],
    ['domain', row.domain],
    ['eventType', row.eventType ?? NETWORK_EMPTY_LABEL],
    ['level', getNetworkLevelLabel(row.level)],
    ['correlationId', row.correlationId ?? NETWORK_EMPTY_LABEL],
    ['entityId', row.entityId ?? NETWORK_EMPTY_LABEL],
    ['durationMs', row.durationMs !== undefined ? String(row.durationMs) : NETWORK_EMPTY_LABEL],
  ];
}

/**
 * Reads a row's correlation id, or null when it carries none.
 *
 * An empty string counts as absent: it is what the Go DTO's `omitempty` tag
 * and a blank column both produce, and querying siblings for `''` would match
 * every uncorrelated event in the store.
 */
export function readCorrelationId(row: Readonly<RuntimeEventRow> | null): string | null {
  if (row === null || row.correlationId === undefined || row.correlationId === '') {
    return null;
  }

  return row.correlationId;
}

/** Reports whether an event carries a usable correlation id. */
function hasCorrelationId(row: Readonly<RuntimeEventRow>): boolean {
  return readCorrelationId(row) !== null;
}

/**
 * Builds the inspector's Trace section view-models from the sibling events the
 * persisted store returned for the selected event's correlation id.
 *
 * The order is asserted here rather than inherited: `SearchRuntimeEvents`
 * returns rows newest-first, while this section's contract is time-ordered, so
 * an implicit array order would silently render the trace backwards (design
 * D-6.3). Returns an empty list when the selected event has no correlation id
 * — callers MUST render the explicit "no correlation" state in that case
 * rather than an empty list.
 */
export function getNetworkTraceEntries(
  siblings: readonly RuntimeEventRow[],
  selected: Readonly<RuntimeEventRow>,
): readonly NetworkTraceEntryViewModel[] {
  if (!hasCorrelationId(selected)) {
    return [];
  }

  return siblings
    .filter((sibling) => sibling.correlationId === selected.correlationId)
    .slice()
    .sort((left, right) => left.occurredAtMs - right.occurredAtMs)
    .map((sibling) => ({
      id: sibling.id,
      timeLabel: formatNetworkTime(sibling.occurredAtMs),
      domain: sibling.domain,
      message: getNetworkMessage(sibling),
      isSelected: sibling.id === selected.id,
    }));
}

/**
 * Counts the loaded feed rows, independent of the visible window. Used by the
 * Network panel's status bar.
 */
export function countEntries(rows: readonly RuntimeEventRow[]): number {
  return rows.length;
}

/**
 * Counts the loaded rows whose level is "error" (case-insensitive),
 * independent of the visible window. Used by the Network panel's status bar.
 */
export function countErrorEntries(rows: readonly RuntimeEventRow[]): number {
  let count = 0;

  for (const row of rows) {
    if (getNetworkLevelLabel(row.level).toLowerCase() === 'error') {
      count += 1;
    }
  }

  return count;
}

/**
 * Maps the selected event, plus the siblings fetched for its correlation id,
 * into the detail inspector's full view-model: header fields, metadata table,
 * and trace siblings.
 */
function toNetworkDetailViewModel(
  selected: Readonly<RuntimeEventRow>,
  siblings: readonly RuntimeEventRow[],
): NetworkDetailViewModel {
  return {
    entry: selected,
    timeLabel: formatNetworkTime(selected.occurredAtMs),
    domain: selected.domain,
    level: getNetworkLevelLabel(selected.level),
    message: getNetworkMessage(selected),
    hasCorrelation: hasCorrelationId(selected),
    fields: getNetworkDetailFields(selected),
    metadataEntries: getNetworkMetadataEntries(selected),
    traceEntries: getNetworkTraceEntries(siblings, selected),
  };
}

/**
 * Projects the loaded feed rows into the table's view-models.
 *
 * No filtering happens here any more: the persisted read applies domain,
 * level and free text server-side, so a client-side pass could only ever
 * narrow the page it was already given — the defect S-3 exists to fix.
 */
export function getNetworkPanelRows(rows: readonly RuntimeEventRow[]): readonly NetworkEntryViewModel[] {
  return rows.map(toNetworkEntryViewModel);
}

/**
 * Resolves the selected feed row and its detail view-model together so the
 * hook no longer duplicates selection guard logic. Trace siblings come from
 * the persisted store rather than the loaded page, so a correlation stays
 * followable across an application restart.
 */
export function getNetworkPanelSelection(
  rows: readonly RuntimeEventRow[],
  selectedId: string | null,
  traceSiblings: readonly RuntimeEventRow[],
): NetworkPanelSelection {
  const selectedEntry = selectedId === null ? undefined : rows.find((row) => row.id === selectedId);

  if (selectedEntry === undefined) {
    return {
      selectedEntry: null,
      selectedDetail: null,
    };
  }

  return {
    selectedEntry,
    selectedDetail: toNetworkDetailViewModel(selectedEntry, traceSiblings),
  };
}

/**
 * Derives the Network panel status-bar counters from the loaded feed plus the
 * already-windowed shown row count. Total/error counts remain independent of
 * the visible window, matching the pre-repoint hook contract.
 */
export function getNetworkPanelSummary(
  rows: readonly RuntimeEventRow[],
  shownCount: number,
): NetworkPanelSummary {
  return {
    entryCount: countEntries(rows),
    errorCount: countErrorEntries(rows),
    shownCount,
  };
}

/**
 * Resolves what the rail must disclose about the persisted store, or null when
 * there is nothing to disclose.
 *
 * A failed read wins over an absent store because it is the more specific
 * fact: reporting "this database is old" for a query that actually broke is
 * exactly the collapse the Go contract keeps `Available` and `Degraded` apart
 * to prevent.
 */
export function resolveEventStatusMessage(available: boolean, degraded: boolean): string | null {
  if (degraded) {
    return NETWORK_EVENTS_DEGRADED_MESSAGE;
  }

  if (!available) {
    return NETWORK_EVENTS_UNAVAILABLE_MESSAGE;
  }

  return null;
}

/**
 * Resolves the copy the table shows in place of rows. A disclosed reason
 * outranks both the loading and the empty copy: an unreadable store is not a
 * measured "nothing happened", and rendering the ordinary empty state would
 * say exactly that.
 */
export function resolveEventEmptyMessage(isLoading: boolean, statusMessage: string | null): string {
  if (statusMessage !== null) {
    return statusMessage;
  }

  return isLoading ? NETWORK_LOADING_STATE_MESSAGE : NETWORK_EMPTY_STATE_MESSAGE;
}

/**
 * Returns the left-border accent Tailwind class for a table row, keyed by
 * level, so `NetworkTable` shows DevTools-style colored striping. Falls back
 * to a neutral divider border for unknown levels.
 */
export function getNetworkLevelAccentBorderClass(level: string): string {
  return NETWORK_LEVEL_ACCENT_BORDER_CLASS[level.toLowerCase()] ?? 'border-l-divider';
}
