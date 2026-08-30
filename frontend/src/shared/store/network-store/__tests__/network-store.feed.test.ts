import { beforeEach, describe, expect, it } from 'vitest';
import type { ObservabilityLogEntry } from '../../../contracts/observability.types';
import type { RuntimeEventRecord } from '../../../contracts/runtime-event.types';
import {
  canonicalizeValue,
  fingerprintEventRow,
  mergeEventPage,
  toOverlayEventRow,
  toRuntimeEventRow,
} from '../network-store.feed.helpers';
import { getNetworkStoreState, resetNetworkStore } from '../network-store.helpers';
import type { RuntimeEventRow } from '../network-store.types';

/** Builds one feed row, overridable field by field per test. */
function row(overrides: Partial<RuntimeEventRow> = {}): RuntimeEventRow {
  return {
    id: 'event-1',
    occurredAtMs: 3_000,
    domain: 'sync',
    level: 'info',
    message: 'sync started',
    ...overrides,
  };
}

/** Builds `count` newest-first rows with distinct ids and descending timestamps. */
function rows(count: number): readonly RuntimeEventRow[] {
  return Array.from({ length: count }, (_unused, index) => row({ id: `event-${index}`, occurredAtMs: 90_000 - index }));
}

/** Builds one persisted runtime-event record as `SearchRuntimeEvents` returns it. */
function record(overrides: Partial<RuntimeEventRecord> = {}): RuntimeEventRecord {
  return {
    id: 412,
    occurredAtMs: 3_000,
    domain: 'download',
    level: 'error',
    message: 'download failed',
    ...overrides,
  };
}

/** Builds one live-pushed log entry as the fanout logger emits it. */
function pushed(overrides: Partial<ObservabilityLogEntry> = {}): ObservabilityLogEntry {
  return {
    timestamp: '2026-08-30T10:00:00.000Z',
    domain: 'download',
    level: 'error',
    message: 'download failed',
    ...overrides,
  };
}

describe('canonicalizeValue', () => {
  it('renders undefined distinctly from null and from the empty string', () => {
    expect(canonicalizeValue(undefined)).toBe('undefined');
    expect(canonicalizeValue(null)).toBe('null');
    expect(canonicalizeValue('')).toBe('""');
  });

  it('renders a primitive as its JSON form', () => {
    expect(canonicalizeValue(42)).toBe('42');
    expect(canonicalizeValue('a')).toBe('"a"');
  });

  it('renders an array with comma-separated members', () => {
    expect(canonicalizeValue([1, 'a'])).toBe('[1,"a"]');
  });

  it('separates an array of two members from a single concatenated one', () => {
    expect(canonicalizeValue([1, 2])).not.toBe(canonicalizeValue([12]));
  });

  it('renders object keys in sorted order so key order never changes the result', () => {
    expect(canonicalizeValue({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('separates two objects whose fields differ only in how they pair up', () => {
    expect(canonicalizeValue({ a: 1, b: 2 })).not.toBe(canonicalizeValue({ a: 12, b: undefined }));
  });

  it('recurses through nested structures', () => {
    expect(canonicalizeValue({ outer: { inner: [1] } })).toBe('{"outer":{"inner":[1]}}');
  });
});

describe('mergeEventPage', () => {
  it('discards the previous rows in replace mode', () => {
    const merged = mergeEventPage([row({ id: 'event-old' })], [row({ id: 'event-new' })], 'replace');

    expect(merged.map((entry) => entry.id)).toEqual(['event-new']);
  });

  it('concatenates an older cursor page after the existing rows in append mode', () => {
    const merged = mergeEventPage([row({ id: 'event-new' })], [row({ id: 'event-old' })], 'append');

    expect(merged.map((entry) => entry.id)).toEqual(['event-new', 'event-old']);
  });
});

describe('toRuntimeEventRow', () => {
  it('maps a persisted record onto a row keyed by its database id', () => {
    expect(toRuntimeEventRow(record({ correlationId: 'corr-1', eventType: 'download.failed', durationMs: 42 }))).toEqual({
      id: 'event-412',
      occurredAtMs: 3_000,
      domain: 'download',
      level: 'error',
      message: 'download failed',
      correlationId: 'corr-1',
      entityId: undefined,
      eventType: 'download.failed',
      durationMs: 42,
      metadata: undefined,
    });
  });
});

describe('toOverlayEventRow', () => {
  it('parses the pushed timestamp into epoch milliseconds', () => {
    expect(toOverlayEventRow(pushed()).occurredAtMs).toBe(Date.UTC(2026, 7, 30, 10, 0, 0));
  });

  it('falls back to 0 for an unparseable timestamp rather than producing NaN', () => {
    expect(toOverlayEventRow(pushed({ timestamp: 'not-a-timestamp' })).occurredAtMs).toBe(0);
  });

  it('defaults an absent level to info', () => {
    expect(toOverlayEventRow({ timestamp: '2026-08-30T10:00:00.000Z', domain: 'bus', message: 'tick' }).level).toBe('info');
  });

  it('gives each pushed entry a distinct synthetic id, since the push has no persisted id', () => {
    const first = toOverlayEventRow(pushed());
    const second = toOverlayEventRow(pushed());

    expect(first.id).not.toBe(second.id);
  });

  it('names every synthetic id with an ascending counter', () => {
    expect(toOverlayEventRow(pushed()).id).toMatch(/^overlay-\d+$/);
  });
});

describe('fingerprintEventRow', () => {
  it('fingerprints a persisted row and its live push identically', () => {
    const persisted = toRuntimeEventRow(record({ occurredAtMs: Date.UTC(2026, 7, 30, 10, 0, 0) }));
    const live = toOverlayEventRow(pushed());

    expect(fingerprintEventRow(live)).toBe(fingerprintEventRow(persisted));
  });

  it('ignores the row id, which a live push does not have yet', () => {
    expect(fingerprintEventRow(row({ id: 'overlay-7' }))).toBe(fingerprintEventRow(row({ id: 'event-9' })));
  });

  it('separates rows differing only in correlation id', () => {
    expect(fingerprintEventRow(row({ correlationId: 'corr-1' }))).not.toBe(
      fingerprintEventRow(row({ correlationId: 'corr-2' })),
    );
  });

  it('separates rows differing only in entity id', () => {
    expect(fingerprintEventRow(row({ entityId: 'anime-1' }))).not.toBe(fingerprintEventRow(row({ entityId: 'anime-2' })));
  });

  it('separates rows differing only in event type', () => {
    expect(fingerprintEventRow(row({ eventType: 'sync.started' }))).not.toBe(
      fingerprintEventRow(row({ eventType: 'sync.finished' })),
    );
  });

  it('separates rows differing only in duration', () => {
    expect(fingerprintEventRow(row({ durationMs: 42 }))).not.toBe(fingerprintEventRow(row({ durationMs: 43 })));
  });

  it('treats an absent correlation id and an empty one as the same row', () => {
    expect(fingerprintEventRow(row({ correlationId: '' }))).toBe(fingerprintEventRow(row()));
  });

  it('treats an absent entity id and an empty one as the same row', () => {
    expect(fingerprintEventRow(row({ entityId: '' }))).toBe(fingerprintEventRow(row()));
  });

  it('treats an absent event type and an empty one as the same row', () => {
    expect(fingerprintEventRow(row({ eventType: '' }))).toBe(fingerprintEventRow(row()));
  });

  it('treats an absent duration and a zero one as the same row', () => {
    expect(fingerprintEventRow(row({ durationMs: 0 }))).toBe(fingerprintEventRow(row()));
  });

  it('separates rows differing only in domain', () => {
    expect(fingerprintEventRow(row({ domain: 'download' }))).not.toBe(fingerprintEventRow(row()));
  });

  it('separates rows differing only in level', () => {
    expect(fingerprintEventRow(row({ level: 'error' }))).not.toBe(fingerprintEventRow(row()));
  });

  it('separates rows differing only in message', () => {
    expect(fingerprintEventRow(row({ message: 'a' }))).not.toBe(fingerprintEventRow(row({ message: 'b' })));
  });

  it('separates rows differing only in timestamp', () => {
    expect(fingerprintEventRow(row({ occurredAtMs: 1 }))).not.toBe(fingerprintEventRow(row({ occurredAtMs: 2 })));
  });

  it('treats an absent metadata bag and an empty one as the same row', () => {
    expect(fingerprintEventRow(row({ metadata: {} }))).toBe(fingerprintEventRow(row({ metadata: undefined })));
  });

  it('is insensitive to metadata key order', () => {
    const left = fingerprintEventRow(row({ metadata: { path: '/api', status: 200 } }));
    const right = fingerprintEventRow(row({ metadata: { status: 200, path: '/api' } }));

    expect(left).toBe(right);
  });
});

describe('network store — runtime event feed', () => {
  beforeEach(() => {
    resetNetworkStore();
  });

  it('starts with an empty feed, no cursor, no head, and an available store', () => {
    const state = getNetworkStoreState();

    expect(state.page).toEqual([]);
    expect(state.overlay).toEqual([]);
    expect(state.nextCursor).toBeNull();
    expect(state.head).toBeNull();
    expect(state.isLoadingMore).toBe(false);
    expect(state.available).toBe(true);
    expect(state.domainOptions).toEqual([]);
  });

  it('anchors the head on the newest row of a replaced first page', () => {
    getNetworkStoreState().setPage([row({ id: 'event-2', occurredAtMs: 5_000 }), row({ id: 'event-1' })], 'cur-1', 'replace');

    expect(getNetworkStoreState().head).toBe(5_000);
    expect(getNetworkStoreState().nextCursor).toBe('cur-1');
  });

  it('leaves the head null when a replaced page is empty', () => {
    getNetworkStoreState().setPage([], null, 'replace');

    expect(getNetworkStoreState().head).toBeNull();
  });

  it('appends an older cursor page at the tail without moving the head', () => {
    const store = getNetworkStoreState();
    store.setPage([row({ id: 'event-2', occurredAtMs: 5_000 })], 'cur-1', 'replace');
    store.setPage([row({ id: 'event-1', occurredAtMs: 4_000 })], 'cur-2', 'append');

    expect(getNetworkStoreState().page.map((entry) => entry.id)).toEqual(['event-2', 'event-1']);
    expect(getNetworkStoreState().head).toBe(5_000);
  });

  it('drops the overlay when a replaced page re-anchors the admission boundary', () => {
    const store = getNetworkStoreState();
    store.prependOverlay(row({ id: 'overlay-1', occurredAtMs: 6_000 }));
    store.setPage([row({ id: 'event-2', occurredAtMs: 5_000 })], null, 'replace');

    expect(getNetworkStoreState().overlay).toEqual([]);
  });

  it('keeps the overlay when an older cursor page is appended', () => {
    const store = getNetworkStoreState();
    store.setPage([row({ id: 'event-2', occurredAtMs: 5_000 })], 'cur-1', 'replace');
    store.prependOverlay(row({ id: 'overlay-1', occurredAtMs: 6_000 }));
    store.setPage([row({ id: 'event-1', occurredAtMs: 4_000 })], null, 'append');

    expect(getNetworkStoreState().overlay.map((entry) => entry.id)).toEqual(['overlay-1']);
  });

  it('never caps the paged feed, because a cap deletes rows the user just paged in', () => {
    getNetworkStoreState().setPage(rows(250), null, 'replace');

    expect(getNetworkStoreState().page).toHaveLength(250);
  });

  it('never caps the overlay either', () => {
    const store = getNetworkStoreState();

    for (let index = 0; index < 250; index += 1) {
      store.prependOverlay(row({ id: `overlay-${index}`, occurredAtMs: 100_000 + index }));
    }

    expect(getNetworkStoreState().overlay).toHaveLength(250);
  });

  it('adds each admitted push at the head of the overlay', () => {
    const store = getNetworkStoreState();
    store.prependOverlay(row({ id: 'overlay-1', occurredAtMs: 6_000 }));
    store.prependOverlay(row({ id: 'overlay-2', occurredAtMs: 6_001 }));

    expect(getNetworkStoreState().overlay.map((entry) => entry.id)).toEqual(['overlay-2', 'overlay-1']);
  });

  it('records the load-more flag, the store availability, and the derived domain options', () => {
    const store = getNetworkStoreState();
    store.setLoadingMore(true);
    store.setAvailable(false);
    store.setDomainOptions([{ value: 'download', label: 'Download' }]);

    expect(getNetworkStoreState().isLoadingMore).toBe(true);
    expect(getNetworkStoreState().available).toBe(false);
    expect(getNetworkStoreState().domainOptions).toEqual([{ value: 'download', label: 'Download' }]);
  });

  it('clears the whole feed on reset so tests and remounts start clean', () => {
    const store = getNetworkStoreState();
    store.setPage(rows(3), 'cur-1', 'replace');
    store.prependOverlay(row({ id: 'overlay-1', occurredAtMs: 99_999 }));
    store.setLoadingMore(true);
    store.setAvailable(false);
    store.setDomainOptions([{ value: 'bus', label: 'Bus' }]);

    resetNetworkStore();

    const state = getNetworkStoreState();
    expect(state.page).toEqual([]);
    expect(state.overlay).toEqual([]);
    expect(state.nextCursor).toBeNull();
    expect(state.head).toBeNull();
    expect(state.isLoadingMore).toBe(false);
    expect(state.available).toBe(true);
    expect(state.domainOptions).toEqual([]);
  });
});
