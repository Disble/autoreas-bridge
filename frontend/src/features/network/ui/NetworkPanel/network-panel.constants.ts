import type { NetworkStatusFilterOption } from './network-panel.types';

/** Label shown for a row/duration that has not resolved yet. */
export const NETWORK_PENDING_LABEL = 'pending';

/** Null Object label for a duration that has not been recorded yet. */
export const NETWORK_DURATION_EMPTY_LABEL = '—';

/** Status-filter dropdown options shown in `NetworkFilterBar`. */
export const NETWORK_STATUS_FILTER_OPTIONS: readonly NetworkStatusFilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'pending', label: 'Pending' },
];

/** Copy shown when the store has no rows yet and the source is healthy. */
export const NETWORK_EMPTY_STATE_MESSAGE = 'No requests captured yet.';

/** Copy shown while the initial replay fetch has not resolved. */
export const NETWORK_LOADING_STATE_MESSAGE = 'Loading recent requests…';

/** Copy shown when the Wails runtime is unavailable (plain browser / Vite dev). */
export const NETWORK_CAPTURE_UNAVAILABLE_MESSAGE = 'Live request capture is unavailable in this environment.';

/** Copy shown in the detail panel when no row is selected. */
export const NETWORK_DETAIL_EMPTY_MESSAGE = 'Select a request to inspect its details.';
