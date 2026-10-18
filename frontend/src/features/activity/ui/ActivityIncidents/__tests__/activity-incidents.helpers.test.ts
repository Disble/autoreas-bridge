import { describe, expect, it, vi } from 'vitest';
import type { ActivityIncidentSummary } from '../../../activity-source/activity.types';
import type { ActivityRun } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { isActivityInternalWhere, readActivityIncidentList, toActivityIncidentListEntries, toActivityOpenSelection, toActivityPickedKey, toActivitySelectionKey, toActivityWhere } from '../activity-incidents.helpers';

/** Local epoch milliseconds of Oct 17 at the given time. */
function at(hours: number, minutes: number): number {
  return new Date(2026, 9, 17, hours, minutes).getTime();
}

/** One incident summary with defaults. */
function incident(overrides: Partial<ActivityIncidentSummary>): ActivityIncidentSummary {
  return {
    latestId: 1,
    fingerprint: 'fp',
    reason: 'http_5xx',
    title: 'Sync failed',
    latestAtMs: at(17, 31),
    firstSeenAtMs: at(17, 0),
    occurrences: 1,
    isNew: false,
    isError: true,
    ...overrides,
  };
}

/** One run with defaults. */
function run(overrides: Partial<ActivityRun>): ActivityRun {
  return {
    correlationId: 'c-1',
    firstAtMs: at(16, 0),
    lastAtMs: at(16, 5),
    steps: 3,
    outcome: 'info',
    firstEventType: 'download.started',
    firstMessage: 'Download started',
    ...overrides,
  };
}

describe('activity-incidents.helpers', () => {
  it.each(['all', 'phone', 'downloads', 'editor', 'schedule', 'season'])('accepts the %s filter', (key) => {
    expect(toActivityWhere(key)).toBe(key);
  });

  it('reads an unknown filter key as All', () => {
    expect(toActivityWhere('bogus')).toBe('all');
    expect(toActivityWhere(3)).toBe('all');
  });

  it('marks only the four bridge-work filters as internal', () => {
    expect(['all', 'phone', 'downloads', 'editor', 'schedule', 'season'].filter((where) => isActivityInternalWhere(toActivityWhere(where)))).toEqual([
      'downloads',
      'editor',
      'schedule',
      'season',
    ]);
  });

  it('words incidents in Go order with their dot, count and New flag, without headings when no run is listed', () => {
    const entries = toActivityIncidentListEntries(
      [incident({ latestId: 9, title: 'Sync failed', occurrences: 5, isNew: true }), incident({ latestId: 4, title: 'List is slow', isError: false, latestAtMs: at(9, 2) })],
      [],
    );

    expect(entries).toEqual([
      { key: 'incident:9', selection: { kind: 'incident', id: 9 }, heading: '', title: 'Sync failed', meta: 'Oct 17, 17:31 · 5 times', tone: 'danger', isNew: true, chip: undefined },
      { key: 'incident:4', selection: { kind: 'incident', id: 4 }, heading: '', title: 'List is slow', meta: 'Oct 17, 09:02', tone: 'warning', isNew: false, chip: undefined },
    ]);
  });

  it('lists runs after the incidents under their own headings, with a chip only when the run needs attention', () => {
    const entries = toActivityIncidentListEntries(
      [incident({ latestId: 9 }), incident({ latestId: 4 })],
      [run({ correlationId: 'c-1', outcome: 'warn' }), run({ correlationId: 'c-2', outcome: 'error', firstMessage: '', firstEventType: 'download.hoster_dead', steps: 1 }), run({ correlationId: 'c-3' })],
    );

    expect(entries.map((entry) => [entry.key, entry.heading])).toEqual([
      ['incident:9', 'Incidents'],
      ['incident:4', ''],
      ['run:c-1', 'Runs'],
      ['run:c-2', ''],
      ['run:c-3', ''],
    ]);
    expect(entries[2]).toEqual({
      key: 'run:c-1',
      selection: { kind: 'run', correlationId: 'c-1' },
      heading: 'Runs',
      title: 'Download started',
      meta: 'Oct 17, 16:05 · 3 steps',
      tone: 'warning',
      isNew: false,
      chip: { label: 'Recovered', color: 'warning' },
    });
    expect(entries[3]).toMatchObject({ title: 'download hoster dead', meta: 'Oct 17, 16:05 · 1 step', tone: 'danger', chip: { label: 'Failed', color: 'danger' } });
    expect(entries[4]).toMatchObject({ tone: 'default', chip: undefined });
  });

  it('heads the runs alone when the filter has runs but no incident', () => {
    expect(toActivityIncidentListEntries([], [run({})]).map((entry) => entry.heading)).toEqual(['Runs']);
  });

  it('names a run by its id when its first event recorded no words', () => {
    expect(toActivityIncidentListEntries([], [run({ correlationId: 'c-9', firstMessage: '', firstEventType: '' })])[0].title).toBe('Run c-9');
  });

  it('keys a selection the way the list keys its rows', () => {
    expect(toActivitySelectionKey({ kind: 'incident', id: 9 })).toBe('incident:9');
    expect(toActivitySelectionKey({ kind: 'run', correlationId: 'c-1' })).toBe('run:c-1');
    expect(toActivitySelectionKey(undefined)).toBe('');
  });

  it('takes the one picked key and ignores an empty pick or "all"', () => {
    expect(toActivityPickedKey(new Set(['req-9']))).toBe('req-9');
    expect(toActivityPickedKey(new Set([7]))).toBe('7');
    expect(toActivityPickedKey(new Set())).toBeUndefined();
    expect(toActivityPickedKey('all')).toBeUndefined();
  });
});

describe('toActivityOpenSelection', () => {
  it('opens the asked incident, and nothing when none was asked', () => {
    expect(toActivityOpenSelection({ incidentId: 42 })).toEqual({ kind: 'incident', id: 42 });
    expect(toActivityOpenSelection(undefined)).toBeUndefined();
  });
});

describe('readActivityIncidentList', () => {
  /** A source listing one incident and one run for any filter. */
  function source(): ActivitySource {
    return {
      listIncidents: vi.fn(() => Promise.resolve([incident({ latestId: 9 })])),
      listRuns: vi.fn(() => Promise.resolve([run({ correlationId: 'c-1' })])),
    } as unknown as ActivitySource;
  }

  it('lists the incidents and the runs of an internal filter', async () => {
    const internal = source();
    const read = await readActivityIncidentList(internal, 'downloads');
    expect(read.status === 'ready' && read.value.map((entry) => entry.key)).toEqual(['incident:9', 'run:c-1']);
    expect(internal.listIncidents).toHaveBeenCalledExactlyOnceWith('downloads');
    expect(internal.listRuns).toHaveBeenCalledExactlyOnceWith('downloads');
  });

  it('lists only the incidents of any other filter, without reading runs', async () => {
    const other = source();
    const read = await readActivityIncidentList(other, 'all');
    expect(read.status === 'ready' && read.value.map((entry) => entry.key)).toEqual(['incident:9']);
    expect(other.listRuns).not.toHaveBeenCalled();
  });
});
