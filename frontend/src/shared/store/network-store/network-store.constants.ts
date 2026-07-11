import type { ObservabilityLogEntry } from '../../contracts/observability.types';

/** Maximum number of raw log entries retained in the Network store buffer. */
export const MAX_LOG_ENTRIES = 200;

/** Module-local mutable state shared by the network store helpers. */
export const NETWORK_STORE_INTERNAL_STATE: {
  perEntrySequence: number;
  perEntryIdByEntry: WeakMap<ObservabilityLogEntry, string>;
  bridgeConsumerCount: number;
  bridgeUnsubscribe: (() => void) | null;
} = {
  perEntrySequence: 0,
  perEntryIdByEntry: new WeakMap<ObservabilityLogEntry, string>(),
  bridgeConsumerCount: 0,
  bridgeUnsubscribe: null,
};
