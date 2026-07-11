import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ObservabilityLogEntry } from '../../contracts/observability.types';
import {
  foldByCorrelationId,
  keepRecent,
  selectEntryById,
  selectEntryViewRows,
} from '../network-store/network-store.helpers';

function entry(overrides: Partial<ObservabilityLogEntry>): ObservabilityLogEntry {
  return {
    timestamp: '2026-06-19T00:00:00Z',
    domain: 'api',
    message: '',
    ...overrides,
  };
}

describe('network-store.helpers', () => {
  it('keeps helper-only contracts in the colocated types module', () => {
    const helperPath = join(process.cwd(), 'src/shared/store/network-store/network-store.helpers.ts');
    const sourceText = readFileSync(helperPath, 'utf8');

    expect(sourceText).not.toMatch(/interface\s+MutableRowAccumulator\b/);
    expect(sourceText).not.toMatch(/export interface\s+EntryWithId\b/);
  });

  describe('keepRecent', () => {
    it('returns the buffer unchanged when under the cap', () => {
      const buffer = [entry({ timestamp: 't1' }), entry({ timestamp: 't2' })];

      expect(keepRecent(buffer, 200)).toEqual(buffer);
    });

    it('caps the buffer to the last N entries, newest last, order-stable', () => {
      const buffer = Array.from({ length: 5 }, (_, index) => entry({ timestamp: `t${index}` }));

      const result = keepRecent(buffer, 3);

      expect(result).toHaveLength(3);
      expect(result.map((item) => item.timestamp)).toEqual(['t2', 't3', 't4']);
    });

    it('does not mutate the input array', () => {
      const buffer = Array.from({ length: 5 }, (_, index) => entry({ timestamp: `t${index}` }));
      const bufferCopy = [...buffer];

      keepRecent(buffer, 3);

      expect(buffer).toEqual(bufferCopy);
      expect(buffer.map((item) => item.timestamp)).toEqual(['t0', 't1', 't2', 't3', 't4']);
    });
  });

  describe('foldByCorrelationId — corrected per-entry-default model', () => {
    it('renders each entry as its own row when correlationId is absent or empty', () => {
      const buffer = [
        entry({ timestamp: 't1', metadata: { method: 'GET', path: '/sync', status: 200 } }),
        entry({ timestamp: 't2', metadata: { method: 'POST', path: '/pair', status: 201 } }),
      ];

      const rows = foldByCorrelationId(buffer);

      expect(rows).toHaveLength(2);
      expect(rows[0].startedAt).toBe('t1');
      expect(rows[1].startedAt).toBe('t2');
    });

    it('folds multiple entries sharing a non-empty correlationId into one row (dedup, LWW)', () => {
      const buffer = [
        entry({ correlationId: 'c1', timestamp: 't1', metadata: { method: 'GET', path: '/sync' } }),
        entry({ correlationId: 'c2', timestamp: 't2', metadata: { method: 'POST', path: '/pair' } }),
        entry({ correlationId: 'c1', timestamp: 't3', durationMs: 42, metadata: { status: 200 } }),
      ];

      const rows = foldByCorrelationId(buffer);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        correlationId: 'c1',
        method: 'GET',
        path: '/sync',
        status: 200,
        durationMs: 42,
        startedAt: 't1',
        updatedAt: 't3',
      });
      expect(rows[0].events).toHaveLength(2);
      expect(rows[1]).toMatchObject({ correlationId: 'c2', method: 'POST', path: '/pair', startedAt: 't2' });
    });

    it('never drops an entry that lacks a correlationId', () => {
      const buffer = [
        entry({ timestamp: 't1', metadata: { method: 'GET', path: '/a' } }),
        entry({ correlationId: 'c1', timestamp: 't2', metadata: { method: 'GET', path: '/b' } }),
        entry({ timestamp: 't3', metadata: { method: 'GET', path: '/c' } }),
      ];

      const rows = foldByCorrelationId(buffer);

      expect(rows).toHaveLength(3);
      expect(rows.map((row) => row.path)).toEqual(['/a', '/b', '/c']);
    });

    it('is order-stable by startedAt even when later events update an earlier row', () => {
      const buffer = [
        entry({ correlationId: 'c1', timestamp: 't1', metadata: { method: 'GET', path: '/sync' } }),
        entry({ correlationId: 'c2', timestamp: 't2', metadata: { method: 'POST', path: '/pair' } }),
        entry({ correlationId: 'c1', timestamp: 't3', metadata: { status: 200 } }),
      ];

      const rows = foldByCorrelationId(buffer);

      expect(rows.map((row) => row.correlationId)).toEqual(['c1', 'c2']);
    });

    it('is pure: produces an equivalent result for the same input with no mutation', () => {
      const buffer = [entry({ correlationId: 'c1', timestamp: 't1', metadata: { method: 'GET', path: '/sync' } })];
      const bufferSnapshotBefore = JSON.parse(JSON.stringify(buffer));

      const first = foldByCorrelationId(buffer);
      const second = foldByCorrelationId(buffer);

      expect(first).toEqual(second);
      expect(buffer).toEqual(bufferSnapshotBefore);
    });
  });

  describe('selectEntryViewRows', () => {
    it('returns one row per entry, not folded by correlationId', () => {
      const buffer = [
        entry({ correlationId: 'c1', timestamp: 't1', domain: 'anime', message: 'publishing anime.changed' }),
        entry({ correlationId: 'c1', timestamp: 't2', domain: 'bus', message: 'bus.publish received' }),
        entry({ timestamp: 't3', domain: 'api', message: '' }),
      ];

      const rows = selectEntryViewRows(buffer, '', 'all');

      expect(rows).toHaveLength(3);
    });

    it('filters by free text across message, domain, eventType, and path (case-insensitive)', () => {
      const buffer = [
        entry({ timestamp: 't1', domain: 'sync', message: 'syncing anime catalogue' }),
        entry({ timestamp: 't2', domain: 'anime', message: 'publishing anime.changed', eventType: 'anime.publish' }),
        entry({ timestamp: 't3', domain: 'api', message: '', metadata: { method: 'GET', path: '/sync' } }),
      ];

      const rows = selectEntryViewRows(buffer, 'SYNC', 'all');

      expect(rows).toHaveLength(2);
      expect(rows.map((entryRow) => entryRow.entry.timestamp)).toEqual(['t1', 't3']);
    });

    it('filters by level', () => {
      const buffer = [
        entry({ timestamp: 't1', level: 'info', message: 'a' }),
        entry({ timestamp: 't2', level: 'error', message: 'b' }),
        entry({ timestamp: 't3', level: 'error', message: 'c' }),
      ];

      const rows = selectEntryViewRows(buffer, '', 'error');

      expect(rows).toHaveLength(2);
      expect(rows.map((entryRow) => entryRow.entry.timestamp)).toEqual(['t2', 't3']);
    });

    it('treats a missing level as "info" for filtering purposes', () => {
      const buffer = [entry({ timestamp: 't1', message: 'no level set' })];

      const rows = selectEntryViewRows(buffer, '', 'info');

      expect(rows).toHaveLength(1);
    });

    it('filters by domain', () => {
      const buffer = [
        entry({ timestamp: 't1', domain: 'sync', message: 'a' }),
        entry({ timestamp: 't2', domain: 'anime', message: 'b' }),
        entry({ timestamp: 't3', domain: 'sync', message: 'c' }),
      ];

      const rows = selectEntryViewRows(buffer, '', 'all', 'sync');

      expect(rows).toHaveLength(2);
      expect(rows.map((entryRow) => entryRow.entry.timestamp)).toEqual(['t1', 't3']);
    });

    it('defaults domainFilter to "all" when omitted', () => {
      const buffer = [
        entry({ timestamp: 't1', domain: 'sync', message: 'a' }),
        entry({ timestamp: 't2', domain: 'anime', message: 'b' }),
      ];

      const rows = selectEntryViewRows(buffer, '', 'all');

      expect(rows).toHaveLength(2);
    });

    it('combines domain filter with level and text filters', () => {
      const buffer = [
        entry({ timestamp: 't1', domain: 'sync', level: 'error', message: 'boom' }),
        entry({ timestamp: 't2', domain: 'sync', level: 'info', message: 'ok' }),
        entry({ timestamp: 't3', domain: 'anime', level: 'error', message: 'boom' }),
      ];

      const rows = selectEntryViewRows(buffer, '', 'error', 'sync');

      expect(rows).toHaveLength(1);
      expect(rows[0].entry.timestamp).toBe('t1');
    });

    it('is pure: never mutates the input buffer', () => {
      const buffer = [entry({ timestamp: 't1', message: 'a' })];
      const bufferSnapshotBefore = JSON.parse(JSON.stringify(buffer));

      selectEntryViewRows(buffer, '', 'all');

      expect(buffer).toEqual(bufferSnapshotBefore);
    });

    it('assigns a stable id per entry across repeated calls on the same buffer', () => {
      const buffer = [entry({ timestamp: 't1', message: 'a' })];

      const first = selectEntryViewRows(buffer, '', 'all');
      const second = selectEntryViewRows(buffer, '', 'all');

      expect(first[0].id).toBe(second[0].id);
    });
  });

  describe('selectEntryById', () => {
    it('returns the entry matching the given id', () => {
      const buffer = [entry({ timestamp: 't1', message: 'a' }), entry({ timestamp: 't2', message: 'b' })];

      const rows = selectEntryViewRows(buffer, '', 'all');

      expect(selectEntryById(buffer, rows[1].id)?.timestamp).toBe('t2');
    });

    it('returns null when id is null', () => {
      const buffer = [entry({ timestamp: 't1', message: 'a' })];

      expect(selectEntryById(buffer, null)).toBeNull();
    });

    it('returns null when no entry matches the id', () => {
      const buffer = [entry({ timestamp: 't1', message: 'a' })];

      expect(selectEntryById(buffer, 'nonexistent')).toBeNull();
    });
  });
});
