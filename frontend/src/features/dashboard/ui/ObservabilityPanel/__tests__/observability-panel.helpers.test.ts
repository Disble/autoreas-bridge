import { describe, expect, it } from 'vitest';
import {
  formatDurationLabel,
  formatMetadataLabel,
  formatTimestamp,
  getDomainColor,
  getLogLevelAccentClass,
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

  it('maps debug to accent', () => {
    expect(getLogLevelColor('debug')).toBe('accent');
  });

  it('falls back to default for unknown levels', () => {
    expect(getLogLevelColor('trace')).toBe('default');
  });
});

describe('formatDurationLabel', () => {
  it('formats duration in milliseconds', () => {
    expect(formatDurationLabel(512)).toBe('512ms');
  });

  it('returns null when duration is missing', () => {
    expect(formatDurationLabel()).toBeNull();
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

describe('formatTimestamp', () => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const localTime = (iso: string) => {
    const date = new Date(iso);

    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  it('formats the time portion in the local timezone', () => {
    expect(formatTimestamp('2026-04-13T18:09:15Z')).toBe(localTime('2026-04-13T18:09:15Z'));
  });

  it('drops milliseconds', () => {
    expect(formatTimestamp('2026-04-13T08:01:02.123Z')).toBe(localTime('2026-04-13T08:01:02.123Z'));
  });
});

describe('getDomainColor', () => {
  it.each([
    ['sync', 'accent'],
    ['bus', 'default'],
    ['websocket', 'warning'],
    ['anime', 'success'],
    ['api', 'danger'],
  ] as const)('maps %s to %s', (domain, expected) => {
    expect(getDomainColor(domain)).toBe(expected);
  });

  it('falls back to default for unknown domains', () => {
    expect(getDomainColor('unknown')).toBe('default');
  });
});

describe('getLogLevelAccentClass', () => {
  it.each([
    ['info', 'border-l-emerald-500'],
    ['warn', 'border-l-amber-500'],
    ['error', 'border-l-red-500'],
    ['debug', 'border-l-violet-500'],
  ] as const)('returns correct accent for %s', (level, expected) => {
    expect(getLogLevelAccentClass(level)).toBe(expected);
  });

  it('returns zinc border for unknown levels', () => {
    expect(getLogLevelAccentClass('trace')).toBe('border-l-zinc-600');
  });

  it('returns zinc border when level is undefined', () => {
    expect(getLogLevelAccentClass()).toBe('border-l-zinc-600');
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
