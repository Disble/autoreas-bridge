import type { ObservabilityLogEntry } from '../../../../shared/contracts/observability.types';
import { formatLocalDateTime, formatLocalTime } from '../../../../shared/datetime/datetime.helpers';
import {
  NETWORK_ACTIVE_PILL_CLASS,
  NETWORK_EMPTY_LABEL,
  NETWORK_HTTP_EVENT_TYPE,
  NETWORK_INACTIVE_PILL_CLASS,
  NETWORK_LEVEL_ACCENT_BORDER_CLASS,
} from './network-panel.constants';
import type {
  EntryWithId,
  HeroChipColor,
  NetworkDetailViewModel,
  NetworkEntryViewModel,
  NetworkTraceEntryViewModel,
} from './network-panel.types';

/**
 * Formats a timestamp as a local-timezone HH:MM:SS for the Network table,
 * delegating to the shared {@link formatLocalTime} so all bridge times render
 * in the computer's own timezone rather than the backend's UTC.
 */
export function formatNetworkTime(timestamp: string): string {
  return formatLocalTime(timestamp);
}

/**
 * Resolves the entry's level, defaulting to "info" when absent. Non-HTTP
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

/**
 * Maps a log level to a small Tailwind background-color class for the
 * DevTools-style colored dot rendered in `NetworkTable`, mirroring
 * `getNetworkLevelColor`'s semantic palette (info=success, debug=accent,
 * warn=warning, error=danger).
 */
export function getNetworkLevelDotClass(level: string | undefined): string {
  switch (getNetworkLevelLabel(level).toLowerCase()) {
    case 'info':
      return 'bg-success';
    case 'warn':
      return 'bg-warning';
    case 'error':
      return 'bg-danger';
    case 'debug':
      return 'bg-accent';
    default:
      return 'bg-default';
  }
}

function readMetadataString(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = metadata?.[key];

  return typeof value === 'string' ? value : undefined;
}

function readMetadataNumber(metadata: Readonly<Record<string, unknown>> | undefined, key: string): number | undefined {
  const value = metadata?.[key];

  return typeof value === 'number' ? value : undefined;
}

/**
 * Resolves the MESSAGE column: the entry's own message, or `METHOD path`
 * when the entry is an `http.request` event. Non-HTTP entries always keep
 * their original message — they are never reduced to a placeholder.
 */
export function getNetworkMessage(entry: ObservabilityLogEntry): string {
  if (entry.eventType === NETWORK_HTTP_EVENT_TYPE) {
    const method = readMetadataString(entry.metadata, 'method') ?? '';
    const path = readMetadataString(entry.metadata, 'path') ?? '';

    return `${method} ${path}`.trim();
  }

  return entry.message;
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
 * Maps a raw log entry (with its stable per-entry id) into the Network
 * table's per-row view-model. Each entry becomes exactly one row — domain
 * events keep their message and level; `http.request` events render as
 * `METHOD path` with a real status/duration when present.
 */
export function toNetworkEntryViewModel({ id, entry }: EntryWithId): NetworkEntryViewModel {
  return {
    id,
    timeLabel: formatNetworkTime(entry.timestamp),
    domain: entry.domain,
    level: getNetworkLevelLabel(entry.level),
    message: getNetworkMessage(entry),
    statusLabel: getNetworkStatusLabel(readMetadataNumber(entry.metadata, 'status')),
    durationLabel: formatNetworkDuration(entry.durationMs),
  };
}

/**
 * Normalizes an entry's metadata into sorted key/value pairs so the
 * inspector renders a deterministic order, mirroring `ObservabilityPanel`'s
 * `getMetadataEntries`.
 */
export function getNetworkMetadataEntries(entry: ObservabilityLogEntry): ReadonlyArray<readonly [string, string]> {
  return Object.entries(entry.metadata ?? {})
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => [key, String(value)] as const);
}

/**
 * Builds the inspector's Fields section: label/value pairs for the entry's
 * own attributes (timestamp, domain, eventType, level, correlationId,
 * entityId, durationMs), each falling back to the Null Object em-dash when
 * absent.
 */
export function getNetworkDetailFields(entry: ObservabilityLogEntry): ReadonlyArray<readonly [string, string]> {
  return [
    ['timestamp', formatLocalDateTime(entry.timestamp)],
    ['domain', entry.domain],
    ['eventType', entry.eventType ?? NETWORK_EMPTY_LABEL],
    ['level', getNetworkLevelLabel(entry.level)],
    ['correlationId', entry.correlationId ?? NETWORK_EMPTY_LABEL],
    ['entityId', entry.entityId ?? NETWORK_EMPTY_LABEL],
    ['durationMs', entry.durationMs !== undefined ? String(entry.durationMs) : NETWORK_EMPTY_LABEL],
  ];
}

/**
 * Builds the inspector's Trace section view-models: sibling entries sharing
 * the selected entry's `correlationId`, time-ordered, with the selected one
 * flagged. Returns an empty array when the entry has no `correlationId` —
 * callers MUST omit the Trace section entirely in that case.
 */
export function getNetworkTraceEntries(
  buffer: readonly EntryWithId[],
  selected: EntryWithId,
): readonly NetworkTraceEntryViewModel[] {
  if (selected.entry.correlationId === undefined || selected.entry.correlationId === '') {
    return [];
  }

  const traceEntries: NetworkTraceEntryViewModel[] = [];

  for (const { id, entry } of buffer) {
    if (entry.correlationId === selected.entry.correlationId) {
      traceEntries.push({
        id,
        timeLabel: formatNetworkTime(entry.timestamp),
        domain: entry.domain,
        message: getNetworkMessage(entry),
        isSelected: id === selected.id,
      });
    }
  }

  return traceEntries;
}

/**
 * Counts the total number of log entries in the buffer, independent of any
 * active filter. Used by the Network panel's status bar.
 */
export function countEntries(buffer: readonly ObservabilityLogEntry[]): number {
  return buffer.length;
}

/**
 * Counts the number of entries whose level is "error" (case-insensitive),
 * independent of any active filter. Used by the Network panel's status bar.
 */
export function countErrorEntries(buffer: readonly ObservabilityLogEntry[]): number {
  let count = 0;

  for (const entry of buffer) {
    if (getNetworkLevelLabel(entry.level).toLowerCase() === 'error') {
      count += 1;
    }
  }

  return count;
}

/**
 * Maps the selected entry (plus the full per-entry buffer for trace lookup)
 * into the detail inspector's full view-model: header fields, metadata
 * table, and trace siblings.
 */
export function toNetworkDetailViewModel(
  selected: EntryWithId,
  buffer: readonly EntryWithId[],
): NetworkDetailViewModel {
  const { entry } = selected;

  return {
    entry,
    timeLabel: formatNetworkTime(entry.timestamp),
    domain: entry.domain,
    level: getNetworkLevelLabel(entry.level),
    message: getNetworkMessage(entry),
    fields: getNetworkDetailFields(entry),
    metadataEntries: getNetworkMetadataEntries(entry),
    traceEntries: getNetworkTraceEntries(buffer, selected),
  };
}

/**
 * Returns the left-border accent Tailwind class for a table row, keyed by
 * level, so `NetworkTable` shows DevTools-style colored striping. Falls back
 * to a neutral divider border for unknown levels.
 */
export function getNetworkLevelAccentBorderClass(level: string): string {
  return NETWORK_LEVEL_ACCENT_BORDER_CLASS[level.toLowerCase()] ?? 'border-l-divider';
}

/**
 * Builds the Tailwind class string for a detail-inspector tab button,
 * highlighting the active tab. Lives here so `NetworkDetail.tsx` stays a dumb
 * component free of root-level logic.
 */
export function getNetworkDetailTabButtonClass(isActive: boolean): string {
  return `rounded-md px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/50 ${
    isActive ? NETWORK_ACTIVE_PILL_CLASS : NETWORK_INACTIVE_PILL_CLASS
  }`;
}

/**
 * Builds the Tailwind class string for a filter pill, highlighting the active
 * option. Shared by the domain and level pill rows in `NetworkFilterBar`.
 */
export function getNetworkFilterPillClass(isActive: boolean): string {
  return `rounded-full px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/50 ${
    isActive ? NETWORK_ACTIVE_PILL_CLASS : NETWORK_INACTIVE_PILL_CLASS
  }`;
}
