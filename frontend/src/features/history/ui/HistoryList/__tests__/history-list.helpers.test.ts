import { describe, expect, it } from 'vitest';
import type { HistoryCandidate } from '../history-list.types';
import {
  buildHistoryEntry,
  isHistoryDetailCandidate,
  qualifiesForHistory,
  sortHistoryEntriesByName,
} from '../history-list.helpers';

function candidate(overrides: Partial<HistoryCandidate>): HistoryCandidate {
  return {
    id: 'anime-1',
    nombre: 'Frieren',
    nrocapvisto: 0,
    totalcap: 28,
    repetir: [],
    ...overrides,
  };
}

describe('isHistoryDetailCandidate', () => {
  it('returns false for zero progress (no detail fetch needed)', () => {
    expect(isHistoryDetailCandidate(candidate({ nrocapvisto: 0 }))).toBe(false);
  });

  it('returns true for any nonzero progress, in-progress or complete', () => {
    expect(isHistoryDetailCandidate(candidate({ nrocapvisto: 1, totalcap: 28 }))).toBe(true);
    expect(isHistoryDetailCandidate(candidate({ nrocapvisto: 28, totalcap: 28 }))).toBe(true);
  });
});

describe('qualifiesForHistory', () => {
  it('excludes an anime with no progress and no repetition history', () => {
    expect(qualifiesForHistory(candidate({ nrocapvisto: 0, totalcap: 28, repetir: [] }))).toBe(false);
  });

  it('includes an anime that is in-progress (started but not finished)', () => {
    expect(qualifiesForHistory(candidate({ nrocapvisto: 12, totalcap: 28, repetir: [] }))).toBe(true);
  });

  it('excludes an anime that is complete with no repetition history', () => {
    expect(qualifiesForHistory(candidate({ nrocapvisto: 28, totalcap: 28, repetir: [] }))).toBe(false);
  });

  it('includes a complete anime that has at least one repetition entry', () => {
    expect(
      qualifiesForHistory(
        candidate({
          nrocapvisto: 28,
          totalcap: 28,
          repetir: [{ numrepeticion: 1, nrocapvisto: 28, estado: 1 }],
        }),
      ),
    ).toBe(true);
  });

  it('treats a missing totalcap as not-in-progress (matches formatAnimeProgress fallback)', () => {
    expect(qualifiesForHistory(candidate({ nrocapvisto: 5, totalcap: undefined, repetir: [] }))).toBe(false);
  });
});

describe('buildHistoryEntry', () => {
  it('orders the repetition timeline most-recent fechaRepeticion first', () => {
    const entry = buildHistoryEntry(
      candidate({
        nrocapvisto: 28,
        totalcap: 28,
        repetir: [
          { numrepeticion: 1, nrocapvisto: 28, estado: 1, fechaRepeticion: Date.UTC(2021, 0, 1) },
          { numrepeticion: 2, nrocapvisto: 28, estado: 1, fechaRepeticion: Date.UTC(2023, 0, 1) },
          { numrepeticion: 3, nrocapvisto: 28, estado: 1, fechaRepeticion: Date.UTC(2022, 0, 1) },
        ],
      }),
    );

    expect(entry.repetitions.map((r) => r.numRepeticion)).toEqual([2, 3, 1]);
    expect(entry.repetitionCount).toBe(3);
  });

  it('sorts an entry with a null/absent fechaRepeticion last', () => {
    const entry = buildHistoryEntry(
      candidate({
        nrocapvisto: 28,
        totalcap: 28,
        repetir: [
          { numrepeticion: 1, nrocapvisto: 28, estado: 1, fechaRepeticion: Date.UTC(2023, 0, 1) },
          { numrepeticion: 2, nrocapvisto: 28, estado: 1 },
        ],
      }),
    );

    expect(entry.repetitions.map((r) => r.numRepeticion)).toEqual([1, 2]);
    expect(entry.repetitions[1]?.repeatedOnLabel).toBe('Unknown');
  });

  it('formats progress and defaults a missing repetir to an empty timeline', () => {
    const entry = buildHistoryEntry(candidate({ nrocapvisto: 12, totalcap: 28, repetir: undefined }));

    expect(entry.progressLabel).toBe('12 / 28');
    expect(entry.repetitionCount).toBe(0);
    expect(entry.repetitions).toEqual([]);
  });
});

describe('sortHistoryEntriesByName', () => {
  it('sorts entries alphabetically by name', () => {
    const entries = [
      buildHistoryEntry(candidate({ id: 'b', nombre: 'Zenshuu' })),
      buildHistoryEntry(candidate({ id: 'a', nombre: 'Bocchi the Rock' })),
    ];

    expect(entries.toSorted(sortHistoryEntriesByName).map((e) => e.id)).toEqual(['a', 'b']);
  });
});
