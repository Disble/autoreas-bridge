import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ObservabilityLogEntry } from '../../../../../shared/contracts/observability.types';
import {
  countEntries,
  countErrorEntries,
  formatNetworkDuration,
  getNetworkLevelColor,
  getNetworkLevelLabel,
  getNetworkStatusLabel,
  getNetworkDomainColor,
  getNetworkLevelAccentBorderClass,
  getNetworkPanelRows,
  getNetworkPanelSelection,
  getNetworkPanelSummary,
  toNetworkEntryViewModel,
} from '../network-panel.helpers';

function entry(overrides: Partial<ObservabilityLogEntry> = {}): ObservabilityLogEntry {
  return {
    timestamp: '2026-06-20T10:30:45Z',
    domain: 'anime',
    message: 'publishing anime.changed for tracer-bullet-anime',
    eventType: 'anime.publish',
    ...overrides,
  };
}

describe('getNetworkLevelLabel', () => {
  it('defaults to "info" when level is absent', () => {
    expect(getNetworkLevelLabel(undefined)).toBe('info');
  });

  it('returns the level unchanged when present', () => {
    expect(getNetworkLevelLabel('error')).toBe('error');
  });
});

describe('network-panel.helpers architecture', () => {
  it('keeps helper-only contracts in the colocated types module', () => {
    const helperPath = join(process.cwd(), 'src/features/network/ui/NetworkPanel/network-panel.helpers.ts');
    const sourceText = readFileSync(helperPath, 'utf8');

    expect(sourceText).not.toMatch(/interface\s+(NetworkPanelSelection|NetworkPanelSummary)\b/);
  });
});

describe('getNetworkLevelColor', () => {
  it('maps info to success', () => {
    expect(getNetworkLevelColor('info')).toBe('success');
  });

  it('maps debug to accent', () => {
    expect(getNetworkLevelColor('debug')).toBe('accent');
  });

  it('maps warn to warning', () => {
    expect(getNetworkLevelColor('warn')).toBe('warning');
  });

  it('maps error to danger', () => {
    expect(getNetworkLevelColor('error')).toBe('danger');
  });

  it('defaults missing level to the info color', () => {
    expect(getNetworkLevelColor(undefined)).toBe('success');
  });
});

describe('getNetworkDomainColor', () => {
  it('maps known domains to distinct colors matching the ObservabilityPanel palette', () => {
    expect(getNetworkDomainColor('sync')).toBe('accent');
    expect(getNetworkDomainColor('bus')).toBe('default');
    expect(getNetworkDomainColor('websocket')).toBe('warning');
    expect(getNetworkDomainColor('anime')).toBe('success');
    expect(getNetworkDomainColor('api')).toBe('danger');
  });

  it('defaults unknown domains to default', () => {
    expect(getNetworkDomainColor('unknown-domain')).toBe('default');
  });
});

describe('getNetworkStatusLabel', () => {
  it('returns the numeric status as a string when present', () => {
    expect(getNetworkStatusLabel(200)).toBe('200');
  });

  it('returns the Null Object em-dash when status is absent', () => {
    expect(getNetworkStatusLabel(undefined)).toBe('—');
  });
});

describe('formatNetworkDuration', () => {
  it('formats a millisecond duration', () => {
    expect(formatNetworkDuration(82)).toBe('82ms');
  });

  it('returns the Null Object em-dash when duration is absent', () => {
    expect(formatNetworkDuration(undefined)).toBe('—');
  });
});

describe('toNetworkEntryViewModel', () => {
  it('keeps the original message and level for a non-HTTP domain event (no fabricated "pending")', () => {
    const viewModel = toNetworkEntryViewModel(
      { id: '__row_1', entry: entry({ level: 'info', message: 'publishing anime.changed for tracer-bullet-anime', eventType: 'anime.publish' }) },
    );

    expect(viewModel.message).toBe('publishing anime.changed for tracer-bullet-anime');
    expect(viewModel.level).toBe('info');
    expect(viewModel.statusLabel).toBe('—');
  });

  it('renders an http.request entry as METHOD + path, with status and duration', () => {
    const viewModel = toNetworkEntryViewModel({
      id: '__row_2',
      entry: entry({
        eventType: 'http.request',
        durationMs: 82,
        metadata: { method: 'GET', path: '/api/status', status: 200 },
        message: '',
      }),
    });

    expect(viewModel.message).toBe('GET /api/status');
    expect(viewModel.statusLabel).toBe('200');
    expect(viewModel.durationLabel).toBe('82ms');
  });

  it('formats TIME as local-timezone HH:MM:SS from the ISO timestamp', () => {
    const iso = '2026-06-20T10:30:45Z';
    const date = new Date(iso);
    const pad = (value: number) => String(value).padStart(2, '0');
    const expected = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    const viewModel = toNetworkEntryViewModel({ id: '__row_3', entry: entry({ timestamp: iso }) });

    expect(viewModel.timeLabel).toBe(expected);
  });

  it('defaults level to "info" when the entry omits it', () => {
    const viewModel = toNetworkEntryViewModel({ id: '__row_4', entry: entry({ level: undefined }) });

    expect(viewModel.level).toBe('info');
  });

  it('exposes the domain and stable id for selection', () => {
    const viewModel = toNetworkEntryViewModel({ id: '__row_5', entry: entry({ domain: 'sync' }) });

    expect(viewModel.id).toBe('__row_5');
    expect(viewModel.domain).toBe('sync');
  });
});

describe('countEntries', () => {
  it('counts the number of entries in the buffer', () => {
    const buffer = [entry({ timestamp: 't1' }), entry({ timestamp: 't2' })];

    expect(countEntries(buffer)).toBe(2);
  });

  it('returns 0 for an empty buffer', () => {
    expect(countEntries([])).toBe(0);
  });
});

describe('countErrorEntries', () => {
  it('counts only entries with level "error" (case-insensitive)', () => {
    const buffer = [
      entry({ timestamp: 't1', level: 'error' }),
      entry({ timestamp: 't2', level: 'info' }),
      entry({ timestamp: 't3', level: 'ERROR' }),
    ];

    expect(countErrorEntries(buffer)).toBe(2);
  });

  it('returns 0 when there are no error entries', () => {
    const buffer = [entry({ timestamp: 't1', level: 'info' })];

    expect(countErrorEntries(buffer)).toBe(0);
  });
});

describe('getNetworkLevelAccentBorderClass', () => {
  it('maps known levels to their accent border class (case-insensitive)', () => {
    expect(getNetworkLevelAccentBorderClass('error')).toBe('border-l-danger');
    expect(getNetworkLevelAccentBorderClass('WARN')).toBe('border-l-warning');
    expect(getNetworkLevelAccentBorderClass('debug')).toBe('border-l-accent');
  });

  it('falls back to a neutral divider border for unknown levels', () => {
    expect(getNetworkLevelAccentBorderClass('trace')).toBe('border-l-divider');
  });
});

describe('getNetworkPanelRows', () => {
  it('derives filtered row view-models from the raw buffer', () => {
    const buffer = [
      entry({ timestamp: 't1', domain: 'sync', level: 'info', message: 'syncing catalogue' }),
      entry({ timestamp: 't2', domain: 'anime', level: 'error', message: 'publishing failed' }),
    ];

    const rows = getNetworkPanelRows(buffer, 'publish', 'error', 'anime');

    expect(rows).toHaveLength(1);
    expect(rows[0].domain).toBe('anime');
    expect(rows[0].level).toBe('error');
    expect(rows[0].message).toBe('publishing failed');
  });

  it('preserves one row per entry when entries share a correlation id', () => {
    const buffer = [
      entry({ timestamp: 't1', correlationId: 'c1', message: 'first' }),
      entry({ timestamp: 't2', correlationId: 'c1', message: 'second' }),
    ];

    const rows = getNetworkPanelRows(buffer, '', 'all', 'all');

    expect(rows.map((row) => row.message)).toEqual(['first', 'second']);
  });
});

describe('getNetworkPanelSelection', () => {
  it('returns the selected entry and detail view-model for a matching row id', () => {
    const selected = entry({ timestamp: 't1', correlationId: 'trace-1', message: 'selected' });
    const sibling = entry({ timestamp: 't2', correlationId: 'trace-1', message: 'sibling' });
    const selectedId = getNetworkPanelRows([selected], '', 'all', 'all')[0].id;

    const selection = getNetworkPanelSelection([selected, sibling], selectedId);

    expect(selection.selectedEntry).toBe(selected);
    expect(selection.selectedDetail?.message).toBe('selected');
    expect(selection.selectedDetail?.traceEntries.map((traceEntry) => traceEntry.message)).toEqual(['selected', 'sibling']);
  });

  it('returns null selection state when no row is selected', () => {
    const selection = getNetworkPanelSelection([entry({ timestamp: 't1', message: 'ignored' })], null);

    expect(selection.selectedEntry).toBeNull();
    expect(selection.selectedDetail).toBeNull();
  });
});

describe('getNetworkPanelSummary', () => {
  it('derives total, error, and shown counts for the panel status bar', () => {
    const summary = getNetworkPanelSummary(
      [
        entry({ timestamp: 't1', level: 'info' }),
        entry({ timestamp: 't2', level: 'error' }),
        entry({ timestamp: 't3', level: 'ERROR' }),
      ],
      1,
    );

    expect(summary).toEqual({
      entryCount: 3,
      errorCount: 2,
      shownCount: 1,
    });
  });
});
