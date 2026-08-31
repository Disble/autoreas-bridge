import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatLocalDateTime, formatLocalTime } from '../../../../../shared/datetime/datetime.helpers';
import type { RuntimeEventRow } from '../../../../../shared/store/network-store/network-store.types';
import {
  countEntries,
  countErrorEntries,
  formatNetworkDuration,
  getNetworkDomainColor,
  getNetworkLevelAccentBorderClass,
  getNetworkLevelColor,
  getNetworkLevelLabel,
  getNetworkPanelRows,
  getNetworkPanelSelection,
  getNetworkPanelSummary,
  getNetworkStatusLabel,
  getNetworkTraceEntries,
  readCorrelationId,
  resolveEventEmptyMessage,
  resolveEventStatusMessage,
  toNetworkEntryViewModel,
} from '../network-panel.helpers';

/** Epoch millis for `2026-06-20T10:30:45Z`, the fixture instant every time assertion derives from. */
const FIXTURE_MS = Date.parse('2026-06-20T10:30:45Z');

/** Builds one persisted feed row, overridable per assertion. */
function row(overrides: Partial<RuntimeEventRow> = {}): RuntimeEventRow {
  return {
    id: 'event-1',
    occurredAtMs: FIXTURE_MS,
    domain: 'anime',
    level: 'info',
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

  it('no longer filters rows client-side — the persisted read applies every filter server-side', () => {
    const helperPath = join(process.cwd(), 'src/features/network/ui/NetworkPanel/network-panel.helpers.ts');
    const sourceText = readFileSync(helperPath, 'utf8');

    expect(sourceText).not.toMatch(/selectEntryViewRows|selectEntryById/);
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
    const viewModel = toNetworkEntryViewModel(row({ level: 'info', message: 'publishing anime.changed for tracer-bullet-anime' }));

    expect(viewModel.message).toBe('publishing anime.changed for tracer-bullet-anime');
    expect(viewModel.level).toBe('info');
    expect(viewModel.statusLabel).toBe('—');
  });

  it('renders an http.request row as METHOD + path, with status and duration', () => {
    const viewModel = toNetworkEntryViewModel(row({
      eventType: 'http.request',
      durationMs: 82,
      metadata: { method: 'GET', path: '/api/status', status: 200 },
      message: '',
    }));

    expect(viewModel.message).toBe('GET /api/status');
    expect(viewModel.statusLabel).toBe('200');
    expect(viewModel.durationLabel).toBe('82ms');
  });

  it('formats TIME as local-timezone HH:MM:SS from the persisted epoch millis', () => {
    const viewModel = toNetworkEntryViewModel(row({ occurredAtMs: FIXTURE_MS }));

    expect(viewModel.timeLabel).toBe(formatLocalTime('2026-06-20T10:30:45Z'));
  });

  it('exposes the domain and persisted id for selection', () => {
    const viewModel = toNetworkEntryViewModel(row({ id: 'event-42', domain: 'sync' }));

    expect(viewModel.id).toBe('event-42');
    expect(viewModel.domain).toBe('sync');
  });
});

describe('getNetworkTraceEntries', () => {
  it('orders siblings by their own timestamp instead of inheriting the newest-first array order', () => {
    const selected = row({ id: 'event-2', occurredAtMs: 2_000, correlationId: 'c1', message: 'middle' });
    const siblings = [
      row({ id: 'event-3', occurredAtMs: 3_000, correlationId: 'c1', message: 'newest' }),
      selected,
      row({ id: 'event-1', occurredAtMs: 1_000, correlationId: 'c1', message: 'oldest' }),
    ];

    const traceEntries = getNetworkTraceEntries(siblings, selected);

    expect(traceEntries.map((traceEntry) => traceEntry.message)).toEqual(['oldest', 'middle', 'newest']);
  });

  it('flags the selected sibling and leaves the others unflagged', () => {
    const selected = row({ id: 'event-2', occurredAtMs: 2_000, correlationId: 'c1', message: 'selected' });
    const siblings = [row({ id: 'event-1', occurredAtMs: 1_000, correlationId: 'c1', message: 'sibling' }), selected];

    const traceEntries = getNetworkTraceEntries(siblings, selected);

    expect(traceEntries.map((traceEntry) => traceEntry.isSelected)).toEqual([false, true]);
  });

  it('returns an empty list when the selected event carries no correlation id', () => {
    const selected = row({ id: 'event-9', correlationId: undefined });

    expect(getNetworkTraceEntries([selected], selected)).toEqual([]);
  });

  it('drops siblings fetched under a different correlation id', () => {
    const selected = row({ id: 'event-2', occurredAtMs: 2_000, correlationId: 'c1', message: 'mine' });
    const siblings = [selected, row({ id: 'event-7', occurredAtMs: 1_000, correlationId: 'c2', message: 'theirs' })];

    const traceEntries = getNetworkTraceEntries(siblings, selected);

    expect(traceEntries.map((traceEntry) => traceEntry.message)).toEqual(['mine']);
  });
});

describe('countEntries', () => {
  it('counts the loaded feed rows', () => {
    expect(countEntries([row({ id: 'event-1' }), row({ id: 'event-2' })])).toBe(2);
  });

  it('returns 0 for an empty feed', () => {
    expect(countEntries([])).toBe(0);
  });
});

describe('countErrorEntries', () => {
  it('counts only rows with level "error" (case-insensitive)', () => {
    const rows = [
      row({ id: 'event-1', level: 'error' }),
      row({ id: 'event-2', level: 'info' }),
      row({ id: 'event-3', level: 'ERROR' }),
    ];

    expect(countErrorEntries(rows)).toBe(2);
  });

  it('returns 0 when there are no error rows', () => {
    expect(countErrorEntries([row({ id: 'event-1', level: 'info' })])).toBe(0);
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
  it('projects every loaded row, preserving the feed order the backend returned', () => {
    const rows = getNetworkPanelRows([
      row({ id: 'event-2', occurredAtMs: 2_000, domain: 'anime', message: 'publishing failed', level: 'error' }),
      row({ id: 'event-1', occurredAtMs: 1_000, domain: 'sync', message: 'syncing catalogue' }),
    ]);

    expect(rows.map((viewModel) => viewModel.message)).toEqual(['publishing failed', 'syncing catalogue']);
    expect(rows[0].level).toBe('error');
    expect(rows[1].domain).toBe('sync');
  });

  it('keeps one row per event when several share a correlation id', () => {
    const rows = getNetworkPanelRows([
      row({ id: 'event-2', correlationId: 'c1', message: 'second' }),
      row({ id: 'event-1', correlationId: 'c1', message: 'first' }),
    ]);

    expect(rows.map((viewModel) => viewModel.message)).toEqual(['second', 'first']);
  });
});

describe('getNetworkPanelSelection', () => {
  it('returns the selected row and its detail, tracing siblings from the persisted store rather than the loaded page', () => {
    const selected = row({ id: 'event-2', occurredAtMs: 2_000, correlationId: 'trace-1', message: 'selected' });
    const loadedPage = [selected];
    const persistedSiblings = [
      row({ id: 'event-5', occurredAtMs: 5_000, correlationId: 'trace-1', message: 'sibling' }),
      selected,
    ];

    const selection = getNetworkPanelSelection(loadedPage, 'event-2', persistedSiblings);

    expect(selection.selectedEntry).toBe(selected);
    expect(selection.selectedDetail?.message).toBe('selected');
    expect(selection.selectedDetail?.hasCorrelation).toBe(true);
    expect(selection.selectedDetail?.traceEntries.map((traceEntry) => traceEntry.message)).toEqual(['selected', 'sibling']);
  });

  it('reports the absence of a correlation id explicitly instead of an empty sibling list', () => {
    const selected = row({ id: 'event-3', correlationId: undefined });

    const selection = getNetworkPanelSelection([selected], 'event-3', []);

    expect(selection.selectedDetail?.hasCorrelation).toBe(false);
    expect(selection.selectedDetail?.traceEntries).toEqual([]);
  });

  // The metadata half of this view-model moved to
  // `network-panel-metadata.helpers.test.ts` when the projection grew branches;
  // this case keeps the Fields section, which is what it always pinned here.
  it('keeps the fallback detail fields in the selected detail view-model', () => {
    const selected = row({
      id: 'event-4',
      occurredAtMs: FIXTURE_MS,
      correlationId: 'trace-2',
      eventType: undefined,
      entityId: undefined,
      durationMs: undefined,
      message: '',
    });

    const selection = getNetworkPanelSelection([selected], 'event-4', [selected]);

    expect(selection.selectedDetail?.fields).toEqual([
      ['timestamp', formatLocalDateTime('2026-06-20T10:30:45Z')],
      ['domain', 'anime'],
      ['eventType', '—'],
      ['level', 'info'],
      ['correlationId', 'trace-2'],
      ['entityId', '—'],
      ['durationMs', '—'],
    ]);
  });

  it('returns null selection state when no row is selected', () => {
    const selection = getNetworkPanelSelection([row({ id: 'event-1', message: 'ignored' })], null, []);

    expect(selection.selectedEntry).toBeNull();
    expect(selection.selectedDetail).toBeNull();
  });

  it('returns null selection state when the selected id names no loaded row', () => {
    const selection = getNetworkPanelSelection([row({ id: 'event-1' })], 'event-404', []);

    expect(selection.selectedEntry).toBeNull();
    expect(selection.selectedDetail).toBeNull();
  });
});

describe('getNetworkPanelSummary', () => {
  it('derives total, error, and shown counts for the panel status bar', () => {
    const summary = getNetworkPanelSummary(
      [
        row({ id: 'event-1', level: 'info' }),
        row({ id: 'event-2', level: 'error' }),
        row({ id: 'event-3', level: 'ERROR' }),
      ],
      1,
    );

    expect(summary).toEqual({ entryCount: 3, errorCount: 2, shownCount: 1 });
  });
});

describe('resolveEventStatusMessage', () => {
  it('reports a failed read as degraded, not as an old database', () => {
    expect(resolveEventStatusMessage(true, true)).toBe(
      'The persisted runtime-event store could not be read. Showing whatever was already loaded.',
    );
  });

  it('reports an absent persisted store as unavailable', () => {
    expect(resolveEventStatusMessage(false, false)).toBe(
      'This database has no persisted runtime-event store, so no history can be shown. Events recorded from now on will appear after the store is created.',
    );
  });

  it('prefers the degraded reason when the read failed on a database that has the store', () => {
    expect(resolveEventStatusMessage(false, true)).toBe(
      'The persisted runtime-event store could not be read. Showing whatever was already loaded.',
    );
  });

  it('reports nothing when the store is available and the read succeeded', () => {
    expect(resolveEventStatusMessage(true, false)).toBeNull();
  });
});

describe('resolveEventEmptyMessage', () => {
  it('states the disclosed reason instead of an ordinary empty list', () => {
    expect(resolveEventEmptyMessage(false, 'store unreachable')).toBe('store unreachable');
  });

  it('says it is still loading while the first page is in flight', () => {
    expect(resolveEventEmptyMessage(true, null)).toBe('Loading persisted runtime events…');
  });

  it('says the measured store is empty once a healthy read returned nothing', () => {
    expect(resolveEventEmptyMessage(false, null)).toBe('No runtime events captured yet.');
  });

  it('keeps the disclosed reason ahead of the loading copy while a degraded read retries', () => {
    expect(resolveEventEmptyMessage(true, 'store unreachable')).toBe('store unreachable');
  });
});

describe('readCorrelationId', () => {
  it('returns the correlation id of a row that carries one', () => {
    expect(readCorrelationId(row({ correlationId: 'trace-7' }))).toBe('trace-7');
  });

  it('treats an empty-string correlation id as absent, so no sibling query is issued for it', () => {
    expect(readCorrelationId(row({ correlationId: '' }))).toBeNull();
  });

  it('returns null for a row that carries no correlation id at all', () => {
    expect(readCorrelationId(row({ correlationId: undefined }))).toBeNull();
  });

  it('returns null when nothing is selected', () => {
    expect(readCorrelationId(null)).toBeNull();
  });
});
