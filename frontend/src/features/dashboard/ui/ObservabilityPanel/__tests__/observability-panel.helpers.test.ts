import { describe, expect, it } from 'vitest';
import {
  getLogLevelColor,
  keepRecentEntries,
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
