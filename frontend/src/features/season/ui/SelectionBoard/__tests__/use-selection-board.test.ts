import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source';
import { resetSeasonStore } from '../../../../../shared/store/season-store';
import { useSelectionBoard } from '../use-selection-board';

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  danger: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

const bridgeRuntimeSourceMock = vi.hoisted(() => ({
  openAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
  copyAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
  openAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
  copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

vi.mock('@heroui/react', () => ({
  toast: toastMock,
}));

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: bridgeRuntimeSourceMock,
}));

function createSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue({ id: 's1', name: 'Julio 2026', minApprovalGrade: 4, slots: 12, status: 'open', createdAt: 0 }),
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
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 1, rejected: 1, quotaExceeded: false }),
    createSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    pickFolder: vi.fn().mockResolvedValue(''),
    listSeasons: vi.fn().mockResolvedValue([]),
    getPastSeason: vi.fn().mockResolvedValue(null),
    getPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    getOrderingBoard: vi.fn().mockResolvedValue({ rail: [], grid: [] }),
    saveOrderingDraft: vi.fn().mockResolvedValue('ok'),
    applySchedule: vi.fn().mockResolvedValue({ status: 'ok', applied: 0, failed: [] }),
    reopenOrdering: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    openPage: vi.fn(),
    ...overrides,
  };
}

function created(id: string, animeId: string, grade: number): SeasonAnimeRow {
  return {
    id,
    rawName: id.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId,
    section: 'Visto', sectionOrder: 0,
    grade,
    gradeSource: 'manual',
    skipGrading: false,
    consideration: 'none',
    folderPath: '',
    pageUrl: '',
  };
}

describe('useSelectionBoard', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('exposes open/copy desktop actions sourced from bridgeRuntimeSource', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSelectionBoard(source));

    await act(async () => {
      await result.current.onOpenPage('anime-1');
    });
    expect(bridgeRuntimeSourceMock.openAnimePage).toHaveBeenCalledWith('anime-1');

    await act(async () => {
      await result.current.onCopyPage('anime-1');
    });
    expect(bridgeRuntimeSourceMock.copyAnimePage).toHaveBeenCalledWith('anime-1');
    expect(toastMock.success).toHaveBeenCalledWith('Page URL copied to clipboard');

    await act(async () => {
      await result.current.onOpenFolder('anime-1');
    });
    expect(bridgeRuntimeSourceMock.openAnimeFolder).toHaveBeenCalledWith('anime-1');

    await act(async () => {
      await result.current.onCopyFolder('anime-1');
    });
    expect(bridgeRuntimeSourceMock.copyAnimeFolder).toHaveBeenCalledWith('anime-1');
    expect(toastMock.success).toHaveBeenCalledWith('Folder path copied to clipboard');
  });

  it('loads on mount and derives rows, approved count, and quota', async () => {
    const rows = [created('a', 'anime-a', 5), created('b', 'anime-b', 2)];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useSelectionBoard(source));

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.approvedCount).toBe(1);
    expect(result.current.slots).toBe(12);
    expect(result.current.quota).toBe('under');
    expect(result.current.rows[0].verdict).toBe('approved'); // grouped approved-first
  });

  it('onSetConsideration delegates to the store', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSelectionBoard(source));
    await act(async () => {
      result.current.onSetConsideration('sa-1', 'spare_quota');
    });
    expect(source.setConsideration).toHaveBeenCalledWith('sa-1', 'spare_quota');
  });

  it('onSetMinApprovalGrade and onSetSlots delegate', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSelectionBoard(source));
    await waitFor(() => expect(result.current.minApprovalGrade).toBe(4));
    await act(async () => {
      result.current.onSetMinApprovalGrade(5);
      result.current.onSetSlots(9);
    });
    expect(source.setMinApprovalGrade).toHaveBeenCalledWith(5);
    expect(source.setSlots).toHaveBeenCalledWith(9);
  });

  it('onConfirm returns the confirmation result', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSelectionBoard(source));
    let confirmResult: Awaited<ReturnType<typeof result.current.onConfirm>> | undefined;
    await act(async () => {
      confirmResult = await result.current.onConfirm();
    });
    expect(source.confirmSelection).toHaveBeenCalled();
    expect(confirmResult?.status).toBe('ok');
  });
});
