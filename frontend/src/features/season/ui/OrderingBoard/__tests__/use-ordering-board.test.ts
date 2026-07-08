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

  it('moveToDay places a rail card and bumps the change count', async () => {
    const source = createSource({ rail: [card({ animeId: 'r', section: 'Visto' })], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    act(() => result.current.moveToDay('r', 'Domingo'));
    expect(result.current.columns['Domingo'].map((c) => c.animeId)).toEqual(['r']);
    expect(result.current.rail).toHaveLength(0);
    expect(result.current.changeCount).toBe(1);
  });

  it('onApply saves the draft then applies the schedule', async () => {
    const source = createSource({ rail: [card({ animeId: 'r', section: 'Visto' })], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    act(() => result.current.moveToDay('r', 'Lunes'));

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
