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
