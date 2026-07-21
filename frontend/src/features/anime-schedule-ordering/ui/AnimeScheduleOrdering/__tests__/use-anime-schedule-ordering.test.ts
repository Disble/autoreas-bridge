import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAnimeScheduleOrdering } from '../use-anime-schedule-ordering';
import type { AnimeScheduleOrderingTestDriverRef } from '../anime-schedule-ordering.types';

const board = {
  originAnimeId: 'anime-1',
  boardModifiedAt: 100,
  destinations: [
    { id: 'Lunes', label: 'Lunes', kind: 'weekday' },
    { id: 'Sin ver', label: 'Sin ver', kind: 'special' },
  ],
  entries: [
    { animeId: 'anime-1', name: 'Frieren', active: true, modifiedAt: 100, placements: [{ day: 'Lunes', order: 1 }], status: 0, progress: 1, originHighlighted: true },
  ],
} as const;

describe('useAnimeScheduleOrdering', () => {
  it('reports zero changes for the authoritative board', () => {
    const { result } = renderHook(() => useAnimeScheduleOrdering({ board, onApply: vi.fn() }));
    expect(result.current.changeCount).toBe(0);
  });

  it('stages duplicates in the wildcard area and reports the staged count', () => {
    const { result } = renderHook(() => useAnimeScheduleOrdering({ board, onApply: vi.fn() }));

    act(() => result.current.onDuplicate('anime-1'));

    expect(result.current.stagedAnimeCount).toBe(1);
    expect(result.current.stagingCards.map((card) => card.animeId)).toEqual(['anime-1']);
    expect(result.current.changeCount).toBe(0);
    expect(result.current.validationMessage).toBeUndefined();
  });

  it('resets the full shared draft to authoritative state', () => {
    const { result } = renderHook(() => useAnimeScheduleOrdering({ board, onApply: vi.fn() }));
    act(() => result.current.onDuplicate('anime-1'));
    expect(result.current.stagedAnimeCount).toBe(1);
    act(() => result.current.onReset());
    expect(result.current.stagedAnimeCount).toBe(0);
    expect(result.current.changeCount).toBe(0);
    expect(result.current.validationMessage).toBeUndefined();
  });

  it('scrolls the highlighted origin card into view', () => {
    const origin = document.createElement('div');
    origin.dataset.originAnime = 'anime-1';
    origin.scrollIntoView = vi.fn();
    document.body.append(origin);
    renderHook(() => useAnimeScheduleOrdering({ board, onApply: vi.fn() }));
    expect(origin.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    origin.remove();
  });

  it('separates weekday and special destination rows', () => {
    const { result } = renderHook(() => useAnimeScheduleOrdering({ board, onApply: vi.fn() }));
    expect(result.current.weekdayColumns.map((column) => column.id)).toEqual(['Lunes']);
    expect(result.current.specialColumns.map((column) => column.id)).toEqual(['Sin ver']);
  });

  it('exposes a test driver that moves cards through the real draft state path', () => {
    const testDriverRef: AnimeScheduleOrderingTestDriverRef = {};

    const { result } = renderHook(() => useAnimeScheduleOrdering({ board, onApply: vi.fn(), testDriverRef }));

    act(() => testDriverRef.current?.moveAnime({ animeId: 'anime-1', destinationId: 'Sin ver', order: 1 }));

    expect(result.current.changeCount).toBe(1);
    expect(result.current.specialColumns[0]?.cards.map((card) => card.animeId)).toEqual(['anime-1']);
  });
});
