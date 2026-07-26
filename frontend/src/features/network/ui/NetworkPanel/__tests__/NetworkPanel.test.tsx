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

  it('renders the empty state when there are no runtime events rows', async () => {
    const source = createFakeSource();

    render(<NetworkPanel source={source} />);

    expect(await screen.findByText('No runtime events captured yet.')).toBeInTheDocument();
  });

  it('renders a domain event row with its message, level, and domain (not a fabricated HTTP status)', async () => {
    const recent = [
      entry({ timestamp: 't1', domain: 'anime', level: 'info', message: 'publishing anime.changed for tracer-bullet-anime', eventType: 'anime.publish' }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    expect(await screen.findByText('publishing anime.changed for tracer-bullet-anime')).toBeInTheDocument();
  });

  it('renders an http.request entry as METHOD + path with its real duration while the runtime-event table omits the old Status column', async () => {
    const recent = [
      entry({ timestamp: 't1', eventType: 'http.request', durationMs: 82, metadata: { method: 'GET', path: '/api/status', status: 200 } }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    expect(await screen.findByText('GET /api/status')).toBeInTheDocument();
    expect(screen.getByText('82ms')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('shows the detail empty prompt before any event is selected', async () => {
    const recent = [entry({ timestamp: 't1', message: 'syncing catalogue' })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    await screen.findByText('syncing catalogue');

    expect(screen.getByText('Select an event to inspect its details.')).toBeInTheDocument();
  });

  it('renders the selected entry detail (General tab) after a row is clicked', async () => {
    const recent = [entry({ timestamp: 't1', message: 'syncing catalogue' })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    const row = await screen.findByText('syncing catalogue');
    row.closest('tr')?.click();

    expect(await screen.findByRole('tab', { name: 'General' })).toBeInTheDocument();
    expect(screen.queryByText('Select an event to inspect its details.')).not.toBeInTheDocument();
  });

  it('shows the bottom status bar with entry, error, and shown counts', async () => {
    const recent = [
      entry({ timestamp: 't1', level: 'info', message: 'ok' }),
      entry({ timestamp: 't2', level: 'error', message: 'boom' }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    await screen.findByText('boom');

    expect(screen.getByText('2 entries')).toBeInTheDocument();
    expect(screen.getByText('1 errors')).toBeInTheDocument();
    expect(screen.getByText('2 shown')).toBeInTheDocument();
  });

  it('the inspector close control deselects the row and returns to the empty prompt', async () => {
    const recent = [entry({ timestamp: 't1', message: 'syncing catalogue' })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    const row = await screen.findByText('syncing catalogue');
    row.closest('tr')?.click();

    const closeButton = await screen.findByRole('button', { name: 'Close detail inspector' });
    closeButton.click();

    expect(await screen.findByText('Select an event to inspect its details.')).toBeInTheDocument();
  });

  it('uses event terminology and removes the meaningless Status column from the runtime-event table', async () => {
    const recent = [entry({ timestamp: 't1', domain: 'sync', message: 'syncing catalogue' })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    await screen.findByText('syncing catalogue');

    expect(screen.getByRole('searchbox', { name: 'Filter runtime events' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('the Trace tab is absent when the selected entry has no correlationId', async () => {
    const recent = [entry({ timestamp: 't1', message: 'syncing catalogue' })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    const row = await screen.findByText('syncing catalogue');
    row.closest('tr')?.click();

    await screen.findByRole('tab', { name: 'General' });

    expect(screen.queryByRole('tab', { name: 'Trace' })).not.toBeInTheDocument();
  });

  it('filtering by a domain pill narrows the table to that domain', async () => {
    const recent = [
      entry({ timestamp: 't1', domain: 'sync', message: 'syncing catalogue' }),
      entry({ timestamp: 't2', domain: 'anime', message: 'publishing anime.changed' }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    render(<NetworkPanel source={source} />);

    await screen.findByText('syncing catalogue');

    screen.getByRole('radio', { name: 'Sync' }).click();

    expect(await screen.findByText('syncing catalogue')).toBeInTheDocument();
    expect(screen.queryByText('publishing anime.changed')).not.toBeInTheDocument();
  });
});
