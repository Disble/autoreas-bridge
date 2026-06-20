import type { NetworkRequestRow } from './network-store.types';

/** Maximum number of raw log entries retained in the Network store buffer. */
export const MAX_LOG_ENTRIES = 200;

/** Null Object for "no row selected" detail rendering. */
export const EMPTY_NETWORK_ROW: NetworkRequestRow = {
  correlationId: '',
  method: '',
  path: '',
  status: null,
  durationMs: null,
  domain: '',
  startedAt: '',
  updatedAt: '',
  events: [],
};
