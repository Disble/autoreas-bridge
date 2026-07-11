import type { ObservabilityLogEntry } from '../../shared/contracts/observability.types';

/**
 * Runtime log stream plus recent-log replay fetch used by observability consumers.
 */
export interface ObservabilityLogSource {
  readonly subscribe: (listener: (entry: ObservabilityLogEntry) => void) => () => void;
  readonly getRecentLogs: () => Promise<readonly ObservabilityLogEntry[]>;
}
