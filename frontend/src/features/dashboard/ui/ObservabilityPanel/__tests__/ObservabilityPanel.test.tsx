import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ObservabilityLogEntry, ObservabilityPanelViewModel } from '../observability-panel.types';

const useObservabilityPanelMock = vi.fn();

vi.mock('../use-observability-panel', () => ({
  useObservabilityPanel: () => useObservabilityPanelMock(),
}));

import { ObservabilityPanel } from '../ObservabilityPanel';

function createViewModel(entry: ObservabilityLogEntry): ObservabilityPanelViewModel {
  return {
    entry,
    durationLabel: entry.durationMs ? `${entry.durationMs}ms` : null,
    metadataEntries: Object.entries(entry.metadata ?? {}).map(([key, value]) => [key, String(value)]),
    summaryLabels: [
      ...(entry.eventType ? [`event: ${entry.eventType}`] : []),
      ...(entry.entityId ? [`entity: ${entry.entityId}`] : []),
      ...(entry.correlationId ? [`corr: ${entry.correlationId}`] : []),
      ...(entry.durationMs ? [`${entry.durationMs}ms`] : []),
    ],
  };
}

describe('ObservabilityPanel', () => {
  it('renders structured observability fields when present', () => {
    useObservabilityPanelMock.mockReturnValue({
      entries: [
        createViewModel({
          timestamp: '2026-04-13T18:09:15Z',
          domain: 'api',
          level: 'warn',
          message: 'request completed',
          eventType: 'http.request',
          entityId: 'anime-7',
          correlationId: 'corr-123',
          durationMs: 512,
          metadata: {
            method: 'GET',
            path: '/api/animes',
            status: 200,
          },
        }),
      ],
    });

    render(<ObservabilityPanel />);

    expect(screen.getByText('request completed')).toBeInTheDocument();
    expect(screen.getByText('event: http.request')).toBeInTheDocument();
    expect(screen.getByText('entity: anime-7')).toBeInTheDocument();
    expect(screen.getByText('corr: corr-123')).toBeInTheDocument();
    expect(screen.getByText('512ms')).toBeInTheDocument();
    expect(screen.getByText('method')).toBeInTheDocument();
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('path')).toBeInTheDocument();
    expect(screen.getByText('/api/animes')).toBeInTheDocument();
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('shows the empty state when there are no log entries', () => {
    useObservabilityPanelMock.mockReturnValue({ entries: [] });

    render(<ObservabilityPanel />);

    expect(screen.getByText('Waiting for runtime events\u2026')).toBeInTheDocument();
  });
});
