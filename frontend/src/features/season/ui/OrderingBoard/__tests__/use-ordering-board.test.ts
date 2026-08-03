import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DragOverEvent } from '@dnd-kit/react';

import type { OrderingBoard, OrderingCard, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { ORDERING_AUTOSAVE_DEBOUNCE_MS, ORDERING_DUPLICATE_WEEKDAY_ERROR } from '../ordering-board.constants';
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
    pickFolder: vi.fn().mockResolvedValue(''),
    listSeasons: vi.fn().mockResolvedValue([]),
    getPastSeason: vi.fn().mockResolvedValue(null),
    getPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    getOrderingBoard: vi.fn().mockResolvedValue(board),
    saveOrderingDraft: vi.fn().mockResolvedValue('ok'),
    applySchedule: vi.fn().mockResolvedValue({ status: 'ok', applied: 1, failed: [] }),
    reopenOrdering: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    openPage: vi.fn(),
    ...overrides,
  };
}

function dragOverEvent(sourceId: string, targetId: string): DragOverEvent {
  return {
    preventDefault: vi.fn(),
    operation: {
      canceled: false,
      source: {
        id: sourceId,
        manager: {
          dragOperation: {
            shape: null,
            position: { current: { y: 0 } },
          },
        },
      },
      target: { id: targetId },
    },
  } as unknown as DragOverEvent;
}

describe('useOrderingBoard', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

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

  it('duplicate stages repeated pending rail copies from an approved rail card', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: 'Visto', orden: 2 })], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    act(() => result.current.duplicate('g'));

    expect(result.current.rail.map((instance) => ({ animeId: instance.animeId, section: instance.section, isPendingDuplicate: instance.isPendingDuplicate }))).toEqual([
      { animeId: 'g', section: 'Visto', isPendingDuplicate: false },
      { animeId: 'g', section: '', isPendingDuplicate: true },
    ]);

    act(() => result.current.duplicate('g'));

    expect(result.current.rail.map((instance) => ({ animeId: instance.animeId, section: instance.section, isPendingDuplicate: instance.isPendingDuplicate }))).toEqual([
      { animeId: 'g', section: 'Visto', isPendingDuplicate: false },
      { animeId: 'g', section: '', isPendingDuplicate: true },
      { animeId: 'g', section: '', isPendingDuplicate: true },
    ]);
    expect(result.current.counts['g']).toBe(3);
  });

  it('duplicate stages repeated pending rail copies from an approved rail card with empty section', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: '', orden: 0 })], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    act(() => result.current.duplicate('g'));

    expect(result.current.rail.map((instance) => ({ animeId: instance.animeId, isPendingDuplicate: instance.isPendingDuplicate }))).toEqual([
      { animeId: 'g', isPendingDuplicate: false },
      { animeId: 'g', isPendingDuplicate: true },
    ]);

    act(() => result.current.duplicate('g'));

    expect(result.current.rail.map((instance) => ({ animeId: instance.animeId, isPendingDuplicate: instance.isPendingDuplicate }))).toEqual([
      { animeId: 'g', isPendingDuplicate: false },
      { animeId: 'g', isPendingDuplicate: true },
      { animeId: 'g', isPendingDuplicate: true },
    ]);
    expect(result.current.counts['g']).toBe(3);
  });

  it('skips autosave when the working state already contains a duplicate weekday placement', async () => {
    const source = createSource({
      rail: [],
      grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 }), card({ animeId: 'g', dia: 'Lunes', orden: 2 })],
    });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(2));
    vi.mocked(source.saveOrderingDraft).mockClear();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ORDERING_AUTOSAVE_DEBOUNCE_MS + 50));
    });

    expect(source.saveOrderingDraft).not.toHaveBeenCalled();
  });

  it('blocks apply when the working state contains a duplicate weekday placement', async () => {
    const source = createSource({
      rail: [],
      grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 }), card({ animeId: 'g', dia: 'Lunes', orden: 2 })],
    });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(2));

    await act(async () => {
      await expect(result.current.onApply()).resolves.toEqual({ status: ORDERING_DUPLICATE_WEEKDAY_ERROR, applied: 0, failed: [] });
    });

    expect(source.saveOrderingDraft).not.toHaveBeenCalled();
    expect(source.applySchedule).not.toHaveBeenCalled();
  });

  it('cancels forbidden same-anime weekday hover before projected move state is applied', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: 'Visto', orden: 2 })], grid: [card({ animeId: 'g', dia: 'Jueves', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    act(() => result.current.duplicate('g'));

    const railDuplicateKey = result.current.rail.find((instance) => instance.isPendingDuplicate)?.key;
    const juevesKey = result.current.columns['Jueves'][0]?.key;

    expect(railDuplicateKey).toBeDefined();
    expect(juevesKey).toBeDefined();

    act(() => result.current.onDragOver(dragOverEvent(railDuplicateKey!, juevesKey!)));

    expect(result.current.rail.some((instance) => instance.key === railDuplicateKey)).toBe(true);
    expect(result.current.columns['Jueves'].map((instance) => instance.animeId)).toEqual(['g']);
    expect(result.current.hasInvalidWeekdayPlacements).toBe(false);
  });

  it('keeps valid dragover behavior for allowed targets', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: 'Visto', orden: 2 })], grid: [card({ animeId: 'other', dia: 'Jueves', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    const railSourceKey = result.current.rail[0].key;
    const juevesKey = result.current.columns['Jueves'][0].key;

    act(() => result.current.onDragOver(dragOverEvent(railSourceKey, juevesKey)));

    expect(result.current.rail).toHaveLength(0);
    expect(result.current.columns['Jueves'].map((instance) => instance.animeId)).toEqual(['g', 'other']);
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

  it('keeps the board editable when appliedAt is null', async () => {
    const source = createSource({ rail: [], grid: [], appliedAt: null as unknown as number });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(vi.mocked(source.getOrderingBoard)).toHaveBeenCalledTimes(1));
    expect(result.current.readOnly).toBe(false);
  });

  it('reopens an applied board when reload returns appliedAt null', async () => {
    const source = createSource(
      { rail: [], grid: [], appliedAt: 1_700_000_000_000 },
      {
        getOrderingBoard: vi
          .fn<SeasonSource['getOrderingBoard']>()
          .mockResolvedValueOnce({ rail: [], grid: [], appliedAt: 1_700_000_000_000 })
          .mockResolvedValueOnce({ rail: [], grid: [], appliedAt: null as unknown as number }),
      },
    );
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.readOnly).toBe(true));

    await act(async () => {
      await result.current.onReopen();
    });

    await waitFor(() => expect(result.current.readOnly).toBe(false));
    expect(source.reopenOrdering).toHaveBeenCalledTimes(1);
    expect(source.getOrderingBoard).toHaveBeenCalledTimes(2);
  });
});
