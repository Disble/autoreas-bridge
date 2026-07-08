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
    sendToVerHoy: vi.fn().mockResolvedValue({ status: 'ok', pastDownloadTime: false, downloadTime: '' }),
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

  it('loads the board into rail + weekday columns on mount', async () => {
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

  it('duplicate stages a rail copy and removeCard keeps the last card (min-one)', async () => {
    const source = createSource({ rail: [], grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(1));

    act(() => result.current.duplicate('g'));
    expect(result.current.counts['g']).toBe(2);
    expect(result.current.rail.map((c) => c.animeId)).toEqual(['g']);

    const railKey = result.current.rail[0].key;
    act(() => result.current.removeCard(railKey));
    expect(result.current.counts['g']).toBe(1);

    const lunesKey = result.current.columns['Lunes'][0].key;
    act(() => result.current.removeCard(lunesKey)); // blocked: last card
    expect(result.current.columns['Lunes']).toHaveLength(1);
  });

  it('onApply saves the serialized draft then applies the schedule', async () => {
    const source = createSource({ rail: [], grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(1));

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
