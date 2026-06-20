import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilityLogSource } from '../../../../../infrastructure/observability-log-source';
import type { ObservabilityLogEntry } from '../../../../../shared/contracts/observability.types';
import { resetNetworkStore } from '../../../../../shared/store/network-store';
import { NetworkPanel } from '../NetworkPanel';

function entry(overrides: Partial<ObservabilityLogEntry> = {}): ObservabilityLogEntry {
  return {
    timestamp: '2026-06-20T00:00:00Z',
    domain: 'api',
    message: '',
    ...overrides,
  };
}

function createFakeSource(overrides: Partial<ObservabilityLogSource> = {}): ObservabilityLogSource {
  return {
    subscribe: vi.fn().mockReturnValue(() => undefined),
    getRecentLogs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('NetworkPanel', () => {
  afterEach(() => {
    cleanup();
    resetNetworkStore();
  });

  it('renders the empty state when there are no rows', async () => {
    const source = createFakeSource();

    render(<NetworkPanel source={source} />);

    expect(await screen.findByText('No requests captured yet.')).toBeInTheDocument();
  });

  it('shows the detail empty prompt before any row is selected', async () => {
    const recent = [entry({ timestamp: 't1', metadata: { method: 'GET', path: '/sync', status: 200 } })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    await screen.findByText('/sync');

    expect(screen.getByText('Select a request to inspect its details.')).toBeInTheDocument();
  });

  it('renders the selected row in the detail panel after a row is clicked', async () => {
    const recent = [entry({ timestamp: 't1', metadata: { method: 'GET', path: '/sync', status: 200 } })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    const row = await screen.findByText('/sync');
    row.closest('tr')?.click();

    expect(await screen.findByText('Started')).toBeInTheDocument();
    expect(screen.queryByText('Select a request to inspect its details.')).not.toBeInTheDocument();
  });
});
