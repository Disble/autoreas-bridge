import { MAX_LOG_ENTRIES } from './observability-panel.constants';
import type { ObservabilityLogEntry } from './observability-panel.types';

/**
 * Trims the log buffer to the in-memory retention limit.
 * The dashboard only needs the most recent events to stay responsive.
 */
export function keepRecentEntries(entries: ObservabilityLogEntry[]) {
  return entries.slice(-MAX_LOG_ENTRIES);
}

/**
 * Maps backend log levels to the semantic HeroUI chip colors.
 * This keeps log rendering declarative and avoids UI-specific branching in the component.
 */
export function getLogLevelColor(level?: string): 'default' | 'success' | 'warning' | 'danger' {
  switch ((level ?? '').toLowerCase()) {
    case 'info':
      return 'success';
    case 'warn':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'default';
  }
}

/**
 * Formats backend duration values into a stable dashboard label.
 * This keeps presentation-specific text out of the component tree.
 */
export function formatDurationLabel(durationMs?: number) {
  if (durationMs === undefined) {
    return null;
  }

  return `${durationMs}ms`;
}

/**
 * Normalizes metadata into sorted key/value pairs so the dashboard renders a deterministic order.
 * Stable ordering matters for scanability and for predictable UI tests.
 */
export function getMetadataEntries(entry: ObservabilityLogEntry) {
  return Object.entries(entry.metadata ?? {})
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => [key, String(value)] as const);
}

/**
 * Formats metadata into a more readable key/value label for the dashboard.
 * This avoids visually noisy equals-delimited chips.
 */
export function formatMetadataLabel(key: string, value: string) {
  return `${key}: ${value}`;
}

/**
 * Builds the compact summary labels shown next to each log header.
 * Prefixes make dense structured fields scannable without forcing the user to infer meaning.
 */
export function getSummaryLabels(entry: ObservabilityLogEntry) {
  return [
    ...(entry.eventType ? [`event: ${entry.eventType}`] : []),
    ...(entry.entityId ? [`entity: ${entry.entityId}`] : []),
    ...(entry.correlationId ? [`corr: ${entry.correlationId}`] : []),
    ...(formatDurationLabel(entry.durationMs) ? [formatDurationLabel(entry.durationMs)] : []),
  ];
}

/**
 * Builds a UI-friendly view model from the raw Wails log entry.
 * The hook uses this helper so JSX files stay focused on rendering only.
 */
export function toObservabilityPanelViewModel(entry: ObservabilityLogEntry) {
  return {
    entry,
    durationLabel: formatDurationLabel(entry.durationMs),
    metadataEntries: getMetadataEntries(entry),
    summaryLabels: getSummaryLabels(entry),
  };
}
