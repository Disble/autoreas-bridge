import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderingBoard, OrderingCard, SeasonSource } from '../../../../../infrastructure/season-source';
import { useOrderingBoard } from '../use-ordering-board';

function card(overrides: Partial<OrderingCard> = {}): OrderingCard {
  return { animeId: 'a', name: 'A', dia: '', orden: 0, section: 'Visto', isNewcomer: false, ...overrides };
}

function createSource(board: OrderingBoard, overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(null),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue([]),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue('ok'),
    triggerSeasonDownloads: vi.fn().mockResolvedValue('ok'),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    createSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    getOrderingBoard: vi.fn().mockResolvedValue(board),
    saveOrderingDraft: vi.fn().mockResolvedValue('ok'),
    applySchedule: vi.fn().mockResolvedValue({ status: 'ok', applied: 1, failed: [] }),
    reopenOrdering: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    ...overrides,
  };
}

describe('useOrderingBoard', () => {
  afterEach(() => vi.clearAllMocks());

  it('loads the board into rail + columns on mount', async () => {
    const source = createSource({
      rail: [card({ animeId: 'r', section: 'Visto' })],
      grid: [card({ animeId: 'g', dia: 'Jueves', orden: 1 })],
    });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    expect(result.current.columns['Jueves'].map((c) => c.animeId)).toEqual(['g']);
    expect(result.current.changeCount).toBe(0);
    expect(result.current.readOnly).toBe(false);
  });

  it('moveClone places a rail card onto a day and bumps the change count', async () => {
    const source = createSource({ rail: [card({ animeId: 'r', section: 'Visto' })], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    act(() => result.current.moveClone('r', '', 'Domingo', 0));
    expect(result.current.columns['Domingo'].map((c) => c.animeId)).toEqual(['r']);
    expect(result.current.rail).toHaveLength(0);
    expect(result.current.changeCount).toBe(1);
  });

  it('onDragEnd maps a drop onto an empty column to a placement', async () => {
    const source = createSource({ rail: [card({ animeId: 'r', section: 'Visto' })], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    act(() =>
      // dnd-kit: dragged the rail card, dropped over the empty "Domingo" column droppable.
      result.current.onDragEnd({
        active: { id: 'r::__rail__' },
        over: { id: 'Domingo', data: { current: {} } },
      } as unknown as Parameters<typeof result.current.onDragEnd>[0]),
    );
    expect(result.current.columns['Domingo'].map((c) => c.animeId)).toEqual(['r']);
    expect(result.current.rail).toHaveLength(0);
  });

  it('onDragEnd maps a drop over a card to that card position (day + order)', async () => {
    const source = createSource({
      rail: [],
      grid: [
        card({ animeId: 'a', dia: 'Lunes', orden: 1 }),
        card({ animeId: 'b', dia: 'Lunes', orden: 2 }),
        card({ animeId: 'c', dia: 'Martes', orden: 1 }),
      ],
    });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(2));

    act(() =>
      // dragged c from Martes, dropped over 'a' (index 0 of the Lunes container)
      result.current.onDragEnd({
        active: { id: 'c::Martes' },
        over: { id: 'a::Lunes', data: { current: { sortable: { containerId: 'Lunes', index: 0 } } } },
      } as unknown as Parameters<typeof result.current.onDragEnd>[0]),
    );
    expect(result.current.columns['Lunes'].map((c) => c.animeId)).toEqual(['c', 'a', 'b']);
    expect(result.current.columns['Martes']).toHaveLength(0);
  });

  it('duplicate then removeCard keeps the last card (min-one guard)', async () => {
    const source = createSource({ rail: [], grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(1));

    act(() => result.current.duplicate('g'));
    expect(result.current.cardCounts['g']).toBe(2);
    act(() => result.current.removeCard('g', ''));
    expect(result.current.cardCounts['g']).toBe(1);
    act(() => result.current.removeCard('g', 'Lunes')); // blocked: last card
    expect(result.current.columns['Lunes']).toHaveLength(1);
  });

  it('onApply saves the draft then applies the schedule', async () => {
    const source = createSource({ rail: [card({ animeId: 'r', section: 'Visto' })], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    act(() => result.current.moveClone('r', '', 'Lunes', 0));

    await act(async () => {
      await result.current.onApply();
    });
    expect(source.saveOrderingDraft).toHaveBeenCalled();
    expect(source.applySchedule).toHaveBeenCalled();
  });

  it('marks an already-applied board read-only', async () => {
    const source = createSource({ rail: [], grid: [], appliedAt: 1_700_000_000_000 });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.readOnly).toBe(true));
  });
});
