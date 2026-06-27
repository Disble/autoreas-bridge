import type { NetworkDomainFilterOption, NetworkLevelFilterOption } from './network-panel.types';

/** Null Object label for a value that has not been recorded (status, duration, etc). */
export const NETWORK_EMPTY_LABEL = '—';

/** `eventType` value identifying an HTTP request entry (renders as `METHOD path`). */
export const NETWORK_HTTP_EVENT_TYPE = 'http.request';

/** Level-filter pill options shown in `NetworkFilterBar`. */
export const NETWORK_LEVEL_FILTER_OPTIONS: readonly NetworkLevelFilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
  { value: 'debug', label: 'Debug' },
];

/** Domain-filter pill options shown in `NetworkFilterBar`, mirroring the bridge's known runtime domains. */
export const NETWORK_DOMAIN_FILTER_OPTIONS: readonly NetworkDomainFilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'system', label: 'System' },
  { value: 'anime', label: 'Anime' },
  { value: 'bus', label: 'Bus' },
  { value: 'sync', label: 'Sync' },
  { value: 'websocket', label: 'Websocket' },
  { value: 'api', label: 'Api' },
];

/** Copy shown when the store has no rows yet and the source is healthy. */
export const NETWORK_EMPTY_STATE_MESSAGE = 'No requests captured yet.';

/** Copy shown while the initial replay fetch has not resolved. */
export const NETWORK_LOADING_STATE_MESSAGE = 'Loading recent requests…';

/** Copy shown when the Wails runtime is unavailable (plain browser / Vite dev). */
export const NETWORK_CAPTURE_UNAVAILABLE_MESSAGE = 'Live request capture is unavailable in this environment.';

/** Copy shown in the detail panel when no row is selected. */
export const NETWORK_DETAIL_EMPTY_MESSAGE = 'Select a request to inspect its details.';

/** Placeholder shown in the NetworkFilterBar free-text input. */
export const NETWORK_FILTER_PLACEHOLDER = 'Filter by message, domain or path…';

/** Tab strip labels for the DevTools-style detail inspector (`NetworkDetail`). */
export const NETWORK_DETAIL_TAB_LABELS = {
  general: 'General',
  metadata: 'Metadata',
  trace: 'Trace',
} as const;

/** Left-border accent classes keyed by level, for DevTools-style row striping in `NetworkTable`. */
export const NETWORK_LEVEL_ACCENT_BORDER_CLASS: Readonly<Record<string, string>> = {
  info: 'border-l-success',
  warn: 'border-l-warning',
  error: 'border-l-danger',
  debug: 'border-l-accent',
};

