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

/** Domain-filter value that selects every domain. */
export const NETWORK_ALL_DOMAINS_VALUE = 'all';

/** The always-present all-domains option, prepended to every derived option list. */
export const NETWORK_ALL_DOMAINS_OPTION: NetworkDomainFilterOption = { value: NETWORK_ALL_DOMAINS_VALUE, label: 'All' };

/**
 * Rows rendered before the first scroll. The rail grows from here by
 * the page batch and never unmounts a rendered row (ADR-012, live branch).
 *
 * 20 matches every other rail in the app (`RUN_HISTORY_PAGE_SIZE`,
 * `PROGRESSIVE_LIST_INITIAL_COUNT`). It is a UX choice, not a derived value:
 * an earlier draft used 10 only because a guard test asserted a window of 11
 * from a `currentVisibleCount` of 10, which the initial-batch floor makes
 * unreachable. The test now starts from a reachable window instead.
 */
export const EVENT_PAGE_INITIAL_COUNT = 20;


/**
 * Domain-filter pill options shown in `NetworkFilterBar`.
 *
 * @deprecated Superseded by `toDomainFilterOptions` in `network-feed.helpers.ts`,
 * which derives the options from the unfiltered summary aggregate. This
 * hardcoded list names 6 of the 9 domains the store actually holds — a
 * constant is what made `download` (10.2% of all events) unfilterable. It is
 * deleted together with its only consumer, `NetworkFilterBar.tsx`, when the
 * rail reads the derived options.
 */
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
export const NETWORK_EMPTY_STATE_MESSAGE = 'No runtime events captured yet.';

/** Copy shown while the initial replay fetch has not resolved. */
export const NETWORK_LOADING_STATE_MESSAGE = 'Loading recent requests…';

/** Copy shown when the Wails runtime is unavailable (plain browser / Vite dev). */
export const NETWORK_CAPTURE_UNAVAILABLE_MESSAGE = 'Live request capture is unavailable in this environment.';

/** Copy shown in the detail panel when no row is selected. */
export const NETWORK_DETAIL_EMPTY_MESSAGE = 'Select an event to inspect its details.';

/** Placeholder shown in the NetworkFilterBar free-text input. */
export const NETWORK_FILTER_PLACEHOLDER = 'Filter by event, message, or domain…';

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
