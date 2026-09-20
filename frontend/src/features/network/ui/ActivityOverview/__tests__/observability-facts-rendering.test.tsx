import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { ObservabilityFacts } from '../../../../../infrastructure/observability-facts-source/observability-facts-source.types';
import type { RuntimeEventSource } from '../../../../../infrastructure/runtime-event-source/runtime-event-source.types';
import { resetNetworkStore } from '../../../../../shared/store/network-store/network-store.helpers';
import { resetTransactionStore } from '../../../../../shared/store/transaction-store/transaction-store.helpers';
import { NetworkPanel } from '../../NetworkPanel/NetworkPanel';
import { TransactionPanel } from '../../TransactionPanel/TransactionPanel';
import { ActivityOverview } from '../ActivityOverview';
import { OVERVIEW_LIMITS_UNAVAILABLE_NOTE, OVERVIEW_PARITY_NOTE } from '../activity-overview.constants';
import { degradedFactsFixture, factsFixture } from './observability-facts.test-support';

/**
 * The binding transport is stubbed at the shared seam (not the facts source),
 * so the real loader, the real hook, the real projections, and the real
 * components all run. `bindings.available` decides whether `invokeGoBinding`
 * invokes the `window.go` stub or takes its fallback.
 */
const bindings = vi.hoisted(() => ({ available: false }));

vi.mock('../../../../../infrastructure/wails-bindings.helpers', () => ({
  WAILS_BINDINGS_POLL_MS: 50,
  WAILS_BINDINGS_TIMEOUT_MS: 5000,
  hasGoBinding: () => bindings.available,
  hasRuntimeBindings: () => false,
  waitForBindings: () => Promise.resolve(bindings.available),
  invokeGoBinding: (_name: string, invoke: () => Promise<unknown>, fallback: () => unknown) =>
    bindings.available ? invoke() : Promise.resolve(fallback()),
  createRuntimeSubscription: () => ({ subscribe: () => () => undefined }),
}));

/**
 * Makes the facts binding available (or not) and stubs its payload for the
 * render. A null payload wires the unavailable shape: no `window.go` at all.
 */
function wireFactsBinding(facts: ObservabilityFacts | null): void {
  bindings.available = facts !== null;
  if (facts !== null) {
    window.go = { desktop: { App: { GetObservabilityFacts: () => Promise.resolve(facts) } } } as never;
  }
}

/** Builds a fake transaction source resolving an empty, healthy page. */
function createFakeTransactionSource(): CaptureTransactionSource {
  return {
    listTransactions: vi.fn().mockResolvedValue({
      items: [],
      appliedLimit: 25,
      malformedRowsSkipped: 0,
      warningCount: 0,
      degraded: false,
    }),
    getTransaction: vi.fn(),
    summarizeTransactions: vi.fn().mockResolvedValue({ groups: [], degraded: false }),
  };
}

/** Builds a fake runtime-event source resolving an empty, healthy page. */
function createFakeEventSource(): RuntimeEventSource {
  return {
    searchEvents: vi.fn().mockResolvedValue({
      items: [],
      appliedLimit: 20,
      malformedRowsSkipped: 0,
      warningCount: 0,
      available: true,
      degraded: false,
    }),
    summarizeEvents: vi.fn().mockResolvedValue({
      byDomain: [],
      byLevel: [],
      byEventType: [],
      samples: [],
      available: true,
      degraded: false,
    }),
    subscribe: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('ActivityOverview', () => {
  afterEach(() => {
    cleanup();
    resetNetworkStore();
    resetTransactionStore();
    bindings.available = false;
    Reflect.deleteProperty(window, 'go');
  });

  it.each([
    {
      description: 'the real binding payload',
      facts: factsFixture(),
      visible: [
        /Activity exposes 7 of 8 catalog read capabilities/,
        /get_correlation_timeline: The merged request\+event timeline is excluded because the two stores are keyed on different values, so its request side would render empty by construction/,
        'The request-capture store retains the most recent 5000 rows; the runtime-event store retains the most recent 20000 rows. Summaries show at most 5 newest events and at most 5 latest error samples per group.',
      ] as const,
      absent: [OVERVIEW_PARITY_NOTE, OVERVIEW_LIMITS_UNAVAILABLE_NOTE] as const,
    },
    {
      description: 'an unavailable binding',
      facts: null,
      visible: [OVERVIEW_PARITY_NOTE, OVERVIEW_LIMITS_UNAVAILABLE_NOTE] as const,
      // The negative half is the point: an unavailable read must NOT render a
      // measured count, so neither the derived count nor any retention number
      // may appear.
      absent: [/of 8 catalog read capabilities/, /most recent \d+ rows/] as const,
    },
    {
      description: 'a payload with two exclusions',
      facts: factsFixture({
        parity: {
          exposedCapabilities: ['search_requests', 'resolve_request_context', 'get_request_context', 'summary_requests', 'search_events', 'list_device_sync_diagnostics'],
          excludedCapabilities: [
            { name: 'get_correlation_timeline', reason: 'Keyed on different values.' },
            { name: 'summary_events', reason: 'Aggregates only.' },
          ],
          catalogTotal: 8,
        },
      }),
      visible: [
        /Activity exposes 6 of 8 catalog read capabilities/,
        /get_correlation_timeline: Keyed on different values\. summary_events: Aggregates only\./,
      ] as const,
      absent: [] as const,
    },
    {
      description: 'a payload with no exclusions',
      facts: factsFixture({
        parity: {
          exposedCapabilities: [
            'search_requests',
            'resolve_request_context',
            'get_request_context',
            'summary_requests',
            'search_events',
            'summary_events',
            'list_device_sync_diagnostics',
            'get_correlation_timeline',
          ],
          excludedCapabilities: [],
          catalogTotal: 8,
        },
      }),
      visible: ['Activity exposes all 8 catalog read capabilities.'] as const,
      // The negative half pins parity: the all-exposed branch must not fall
      // through to the counted form, not even with an empty exclusion list.
      absent: [/of 8 catalog read capabilities/] as const,
    },
  ])('renders the overview facts for $description', async ({ facts, visible, absent }) => {
    wireFactsBinding(facts);
    render(<ActivityOverview captureSource={createFakeTransactionSource()} eventSource={createFakeEventSource()} />);

    for (const text of visible) {
      expect(await screen.findByText(text)).toBeInTheDocument();
    }
    for (const text of absent) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });
});

describe('TransactionPanel', () => {
  afterEach(() => {
    cleanup();
    resetTransactionStore();
    bindings.available = false;
    Reflect.deleteProperty(window, 'go');
  });

  it.each([
    {
      description: 'the real binding payload',
      facts: factsFixture(),
      visible: ['Showing 25 captured transactions per page; the capture store retains the most recent 5000 rows.'],
      absent: ["the capture store's retention limit is currently unavailable."] as const,
    },
    {
      description: 'an unavailable binding',
      facts: null,
      visible: ["Showing 25 captured transactions per page; the capture store's retention limit is currently unavailable."],
      absent: [/most recent \d+ rows/] as const,
    },
  ])('renders its limits line for $description', async ({ facts, visible, absent }) => {
    wireFactsBinding(facts);
    render(<TransactionPanel source={createFakeTransactionSource()} />);

    for (const text of visible) {
      expect(await screen.findByText(text)).toBeInTheDocument();
    }
    for (const text of absent) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });
});

describe('NetworkPanel', () => {
  afterEach(() => {
    cleanup();
    resetNetworkStore();
    bindings.available = false;
    Reflect.deleteProperty(window, 'go');
  });

  it.each([
    {
      description: 'the real binding payload',
      facts: factsFixture(),
      visible: ['Showing 20 events per page; the event store retains the most recent 20000 rows.'],
      absent: ["the event store's retention limit is currently unavailable."] as const,
    },
    {
      description: 'an unavailable binding',
      facts: null,
      visible: ["Showing 20 events per page; the event store's retention limit is currently unavailable."],
      absent: [/most recent \d+ rows/] as const,
    },
  ])('renders its limits line for $description', async ({ facts, visible, absent }) => {
    wireFactsBinding(facts);
    render(<NetworkPanel source={createFakeEventSource()} />);

    for (const text of visible) {
      expect(await screen.findByText(text)).toBeInTheDocument();
    }
    for (const text of absent) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });
});
