import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilityLogSource } from '../../../../../infrastructure/observability-log-source/observability-log-source.types';
import type { ObservabilityLogEntry } from '../../../../../shared/contracts/observability.types';
import { getNetworkStoreState, resetNetworkStore } from '../../../../../shared/store/network-store/network-store.helpers';
import { NetworkPanel } from '../NetworkPanel';

function entry(overrides: Partial<ObservabilityLogEntry> = {}): ObservabilityLogEntry {
  return { timestamp: '2026-06-20T00:00:00Z', domain: 'api', message: 'msg', ...overrides };
}

function createFakeSource(overrides: Partial<ObservabilityLogSource> = {}): ObservabilityLogSource {
  return {
    subscribe: vi.fn().mockReturnValue(() => undefined),
    getRecentLogs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

/** Installs mocked geometry on the scroll node so jsdom (no layout) can exercise stick-to-bottom. Returns the live scrollTop holder. */
function mockGeometry(node: HTMLElement, scrollHeight: number, clientHeight: number) {
  const state = { scrollTop: 0 };
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

describe('NetworkPanel autoscroll (stick-to-bottom)', () => {
  afterEach(() => {
    cleanup();
    resetNetworkStore();
  });

  it('scrolls the feed wrapper to the bottom when a new entry is ingested', async () => {
    const source = createFakeSource();
    const { container } = render(<NetworkPanel source={source} />);

    const scroller = container.querySelector<HTMLElement>('[data-network-scroll]');
    expect(scroller).not.toBeNull();

    const geom = mockGeometry(scroller as HTMLElement, 5000, 400);

    await act(async () => {
      getNetworkStoreState().ingest(entry({ timestamp: 't1', message: 'fresh entry' }));
    });

    await waitFor(() => {
      expect(geom.scrollTop).toBe(5000);
    });
  });
});
