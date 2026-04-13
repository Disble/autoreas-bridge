import { describe, expect, it } from 'vitest';
import {
  formatDurationLabel,
  formatMetadataLabel,
  getLogLevelColor,
  getMetadataEntries,
  keepRecentEntries,
  toObservabilityPanelViewModel,
} from '../observability-panel.helpers';
import { MAX_LOG_ENTRIES } from '../observability-panel.constants';
import type { ObservabilityLogEntry } from '../observability-panel.types';

describe('keepRecentEntries', () => {
  it('keeps only the most recent entries', () => {
    const entries = Array.from({ length: MAX_LOG_ENTRIES + 2 }, (_, index) => ({
      timestamp: String(index),
      domain: 'sync',
      message: `entry-${index}`,
    })) satisfies ObservabilityLogEntry[];

    const recentEntries = keepRecentEntries(entries);

    expect(recentEntries).toHaveLength(MAX_LOG_ENTRIES);
    expect(recentEntries[0]?.message).toBe('entry-2');
  });
});

describe('getLogLevelColor', () => {
  it('maps warn to warning', () => {
    expect(getLogLevelColor('warn')).toBe('warning');
  });

  it('falls back to default for unknown levels', () => {
    expect(getLogLevelColor('debug')).toBe('default');
  });
});

describe('formatDurationLabel', () => {
  it('formats duration in milliseconds', () => {
    expect(formatDurationLabel(512)).toBe('512ms');
  });

  it('returns null when duration is missing', () => {
    expect(formatDurationLabel(undefined)).toBeNull();
  });
});

describe('getMetadataEntries', () => {
  it('returns sorted metadata entries as strings', () => {
    const entry = {
      timestamp: '2026-04-13T18:09:15Z',
      domain: 'api',
      message: 'request complete',
      metadata: {
        status: 200,
        method: 'GET',
        path: '/api/animes',
      },
    } satisfies ObservabilityLogEntry;

    expect(getMetadataEntries(entry)).toEqual([
      ['method', 'GET'],
      ['path', '/api/animes'],
      ['status', '200'],
    ]);
  });

  it('returns an empty list when metadata is missing', () => {
    const entry = {
      timestamp: '2026-04-13T18:09:15Z',
      domain: 'api',
      message: 'request complete',
    } satisfies ObservabilityLogEntry;

    expect(getMetadataEntries(entry)).toEqual([]);
  });
});

describe('formatMetadataLabel', () => {
  it('formats metadata pairs with a readable label', () => {
    expect(formatMetadataLabel('eventName', 'anime.changed')).toBe('eventName: anime.changed');
  });
});

describe('toObservabilityPanelViewModel', () => {
  it('creates prefixed summary labels for structured fields', () => {
    const viewModel = toObservabilityPanelViewModel({
      timestamp: '2026-04-13T18:09:15Z',
      domain: 'api',
      level: 'warn',
      message: 'request completed',
      eventType: 'http.request',
      entityId: 'anime-7',
      correlationId: 'corr-123',
      durationMs: 512,
      metadata: {
        status: 200,
      },
    });

    expect(viewModel.summaryLabels).toEqual([
      'event: http.request',
      'entity: anime-7',
      'corr: corr-123',
      '512ms',
    ]);
  });
});
