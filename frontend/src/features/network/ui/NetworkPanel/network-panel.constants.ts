import type { NetworkDomainFilterOption, NetworkLevelFilterOption } from './network-panel.types';

/** Null Object label for a value that has not been recorded (status, duration, etc). */
export const NETWORK_EMPTY_LABEL = '—';

/** `eventType` value identifying an HTTP request entry (renders as `METHOD path`). */
export const NETWORK_HTTP_EVENT_TYPE = 'http.request';

/**
 * Indentation the metadata inspector pretty-prints structured values with.
 *
 * Metadata is `map[string]any` on the Go side and the store recurses into
 * nested maps rather than flattening them, so a nested object or an array of
 * objects is legitimate data. Two spaces is what makes that structure readable
 * without turning one value into a page.
 */
export const NETWORK_METADATA_JSON_INDENT = 2;

/** Marker key the event store writes when metadata exceeded the persisted size bound. */
export const NETWORK_METADATA_TRUNCATED_KEY = '_truncated';

/** Marker key carrying how many keys the dropped metadata originally had. */
export const NETWORK_METADATA_ORIGINAL_KEYS_KEY = '_original_keys';

/** How many keys the truncation marker is made of, and therefore the only size it can have. */
export const NETWORK_METADATA_MARKER_KEY_COUNT = 2;

/** Label the truncation notice is filed under, in place of the marker's internal keys. */
export const NETWORK_METADATA_TRUNCATED_LABEL = 'truncated';

/**
 * Copy shown when a value cannot be turned into text at all.
 *
 * Metadata is best-effort on the Go side too — an unmarshalable value binds
 * NULL rather than failing the write — so a value this side cannot render must
 * not take the whole tab down with it.
 */
export const NETWORK_METADATA_UNRENDERABLE_LABEL = 'Value could not be displayed.';

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
 * Rows requested per `SearchRuntimeEvents` page, and the batch the visible
 * window grows by on scroll-near-bottom.
 *
 * Deliberately equal to `EVENT_PAGE_INITIAL_COUNT`, so one scroll reveals
 * exactly one fetched page and the two numbers can never drift apart. 20 is the
 * rail convention across the app (`RUN_HISTORY_PAGE_SIZE`,
 * `PROGRESSIVE_LIST_INITIAL_COUNT`); an earlier draft used 50, which would have
 * made a single scroll reveal two and a half pages and left the fetch size
 * unrelated to anything the user sees.
 */
export const EVENT_PAGE_SIZE = 20;

/**
 * Copy shown when this database has no persisted runtime-event table at all.
 *
 * An unreadable store is NOT a measured "nothing happened", so the surface says
 * which of the two it is rather than rendering an ordinary empty list.
 */
export const NETWORK_EVENTS_UNAVAILABLE_MESSAGE =
  'This database has no persisted runtime-event store, so no history can be shown. Events recorded from now on will appear after the store is created.';

/**
 * Copy shown when the persisted store exists but the read itself failed.
 *
 * Kept distinct from {@link NETWORK_EVENTS_UNAVAILABLE_MESSAGE} for the same
 * reason the Go contract keeps `Available` and `Degraded` apart: collapsing
 * them would report a broken query as an old database.
 */
export const NETWORK_EVENTS_DEGRADED_MESSAGE =
  'The persisted runtime-event store could not be read. Showing whatever was already loaded.';

/**
 * Standing note that `debug` events never reach the persisted store.
 *
 * Measured 2026-08-30 over a month of real use: persisted levels are info
 * 98.4%, warn 1.5%, error 0.1%, debug 0%, and exactly one production debug emit
 * site exists in the whole tree. So this is a one-line disclosure, not a
 * feature — without it an empty `debug` filter reads as "nothing happened".
 */
export const NETWORK_EVENTS_DEBUG_NOT_PERSISTED_NOTE =
  'Debug-level events are not persisted under the current policy, so the Debug filter only shows events pushed during this session.';

/** Copy shown in the Trace tab when the selected event carries no correlation id. */
export const NETWORK_TRACE_NO_CORRELATION_MESSAGE =
  'This event carries no correlation id, so it has no sibling events to follow.';

/** Copy shown when the store has no rows yet and the source is healthy. */
export const NETWORK_EMPTY_STATE_MESSAGE = 'No runtime events captured yet.';

/** Copy shown while the initial replay fetch has not resolved. */
export const NETWORK_LOADING_STATE_MESSAGE = 'Loading persisted runtime events…';

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
