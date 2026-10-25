/**
 * Module-local runtime bridge state shared by the download runtime store helpers.
 * The read counters number each schedule and run-history read, so an answer that
 * arrives after a newer read was issued is dropped instead of overwriting it.
 */
export const DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE: {
  runtimeUnsubscribe: (() => void) | null;
  scheduleReadCount: number;
  runHistoryReadCount: number;
} = {
  runtimeUnsubscribe: null,
  scheduleReadCount: 0,
  runHistoryReadCount: 0,
};
