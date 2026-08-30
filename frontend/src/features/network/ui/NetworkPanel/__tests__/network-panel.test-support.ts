import type { UIEvent } from 'react';
import { vi } from 'vitest';
import type { RuntimeEventSource } from '../../../../../infrastructure/runtime-event-source/runtime-event-source.types';
import type { ObservabilityLogEntry } from '../../../../../shared/contracts/observability.types';
import type {
  RuntimeEventPage,
  RuntimeEventRecord,
  RuntimeEventSummary,
} from '../../../../../shared/contracts/runtime-event.types';

/**
 * Fixtures shared by every Runtime Events rail test: the persisted read
 * envelopes, a fake source, and the jsdom scroll plumbing.
 *
 * Extracted rather than copied because five test files drive the same rail
 * through the same seam, and `use-network-panel.test.ts` crossed the 500-line
 * hard limit carrying its own copy. Follows `bridge-runtime-source.test-support.ts`.
 */

/** Builds one persisted runtime-event record as `SearchRuntimeEvents` returns it. */
export function record(id: number, overrides: Partial<RuntimeEventRecord> = {}): RuntimeEventRecord {
  return {
    id,
    occurredAtMs: 100_000 - id,
    domain: 'sync',
    level: 'info',
    message: `event ${id}`,
    ...overrides,
  };
}

/** Builds `count` newest-first records with distinct ids and descending timestamps. */
export function records(count: number, offset = 0): readonly RuntimeEventRecord[] {
  return Array.from({ length: count }, (_unused, index) => record(offset + index));
}

/** Builds one newest-first page envelope, defaulting to an available, healthy read. */
export function eventPage(items: readonly RuntimeEventRecord[], overrides: Partial<RuntimeEventPage> = {}): RuntimeEventPage {
  return {
    items,
    appliedLimit: 20,
    malformedRowsSkipped: 0,
    warningCount: 0,
    available: true,
    degraded: false,
    ...overrides,
  };
}

/** Builds one summary envelope carrying only the domain facet this rail consumes. */
export function eventSummary(
  byDomain: readonly { readonly key: string; readonly count: number }[] = [],
): RuntimeEventSummary {
  return { byDomain, byLevel: [], byEventType: [], samples: [], available: true, degraded: false };
}

/** Builds a fake persisted runtime-event source, overridable per test. */
export function createFakeSource(overrides: Partial<RuntimeEventSource> = {}): RuntimeEventSource {
  return {
    searchEvents: vi.fn().mockResolvedValue(eventPage([])),
    summarizeEvents: vi.fn().mockResolvedValue(eventSummary()),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

/** Builds a fake source whose live listener the test can drive directly. */
export function createPushableSource(overrides: Partial<RuntimeEventSource> = {}) {
  const listeners: ((entry: ObservabilityLogEntry) => void)[] = [];
  const source = createFakeSource({
    subscribe: vi.fn().mockImplementation((listener: (entry: ObservabilityLogEntry) => void) => {
      listeners.push(listener);

      return () => undefined;
    }),
    ...overrides,
  });

  return {
    source,
    push(entry: ObservabilityLogEntry) {
      for (const listener of listeners) {
        listener(entry);
      }
    },
  };
}

/** Fakes a scroll on a container sitting within the near-bottom threshold. */
export function scrollNearBottom(): UIEvent<HTMLDivElement> {
  return { currentTarget: { scrollTop: 800, clientHeight: 400, scrollHeight: 1_300 } } as unknown as UIEvent<HTMLDivElement>;
}

/** Fakes a scroll on a container still far from its own bottom. */
export function scrollFarFromBottom(): UIEvent<HTMLDivElement> {
  return { currentTarget: { scrollTop: 0, clientHeight: 400, scrollHeight: 5_000 } } as unknown as UIEvent<HTMLDivElement>;
}

/** Installs mocked geometry on a scroll node so jsdom (no layout) can observe viewport movement. Returns the live scrollTop holder. */
export function mockGeometry(node: HTMLElement, scrollTop: number, clientHeight: number, scrollHeight: number) {
  const state = { scrollTop };
  Object.defineProperty(node, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(node, 'clientHeight', { configurable: true, get: () => clientHeight });
  Object.defineProperty(node, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (value: number) => {
      state.scrollTop = value;
    },
  });

  return state;
}
