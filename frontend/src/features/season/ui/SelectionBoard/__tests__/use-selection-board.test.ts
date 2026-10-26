import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { useSelectionBoard } from '../use-selection-board';

/** Toast spy the hooks under test call for their local feedback. */
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  danger: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

/** Runtime-source spy the hooks under test use for desktop actions. */
const bridgeRuntimeSourceMock = vi.hoisted(() => ({
  openAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
  copyAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
  openAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
  copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
  getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
}));

vi.mock('@heroui/react', () => ({
  toast: toastMock,
}));

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: bridgeRuntimeSourceMock,
}));

/** Builds the season port this suite drives, overriding only what a case sets. */
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
    downloadSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    restoreName: vi.fn().mockResolvedValue('ok'),
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 1, rejected: 1, quotaExceeded: false }),
    setSeasonAnimeMetadata: vi.fn().mockResolvedValue('ok'),
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
    getCheckTime: vi.fn().mockResolvedValue('21:00'),
    setCheckTime: vi.fn().mockResolvedValue('ok'),
    openPage: vi.fn(),
    ...overrides,
  };
}

/** Builds a created season anime row with one grade. */
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

  it('groups the rows by verdict and resolves one cover per candidate', async () => {
    const rows = [created('a', 'anime-a', 5), created('b', 'anime-b', 2), created('c', 'anime-c', 6)];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const getAnimeCover = vi.fn((animeId: string) => Promise.resolve({ source: 'cover', dataUrl: `data:${animeId}` }));
    const { result } = renderHook(() => useSelectionBoard(source, { getAnimeCover }));

    await waitFor(() => expect(result.current.getCoverThumb('anime-c').coverSrc).toBe('data:anime-c'));
    expect(result.current.groups.map((group) => [group.label, group.rows.map((row) => row.id)])).toEqual([
      ['Approved', ['a', 'c']],
      ['Rejected', ['b']],
    ]);
    expect(getAnimeCover.mock.calls).toEqual([['anime-a'], ['anime-c'], ['anime-b']]);
  });

  it('applies successive view edits without dropping the previous one', async () => {
    const rows = [created('a', 'anime-a', 6), created('b', 'anime-b', 3), created('c', 'anime-c', 5)];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useSelectionBoard(source));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.onGroupChange('grades', ['6']));
    act(() => result.current.onSortChange('grade-desc'));
    act(() => result.current.onGroupChange('verdicts', ['approved']));

    expect(result.current.criteria).toEqual({ grades: ['6'], verdicts: ['approved'], considerations: [], sort: 'grade-desc' });
    expect(result.current.matchingCount).toBe(1);
  });

  it('exposes the defaults and the season name while the snapshot resolves and after it', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSelectionBoard(source));

    expect(result.current.minApprovalGrade).toBe(4);
    expect(result.current.slots).toBe(12);
    await waitFor(() => expect(result.current.seasonName).toBe('Julio 2026'));
  });

  it('refreshes against a replacement source', async () => {
    const first = createSource();
    const second = createSource();
    const { rerender } = renderHook(({ source }: { source: SeasonSource }) => useSelectionBoard(source), {
      initialProps: { source: first },
    });
    await waitFor(() => expect(first.getSeasonAnimes).toHaveBeenCalled());

    rerender({ source: second });

    await waitFor(() => expect(second.getSeasonAnimes).toHaveBeenCalled());
  });

  it('uses the latest source for its writes', async () => {
    const first = createSource();
    const second = createSource();
    const { result, rerender } = renderHook(({ source }: { source: SeasonSource }) => useSelectionBoard(source), {
      initialProps: { source: first },
    });
    await waitFor(() => expect(first.getSeasonAnimes).toHaveBeenCalled());

    rerender({ source: second });
    await act(async () => {
      result.current.onSetConsideration('sa-1', 'spare_quota');
    });

    expect(second.setConsideration).toHaveBeenCalledWith('sa-1', 'spare_quota');
    expect(first.setConsideration).not.toHaveBeenCalled();
  });

  it('counts an asymmetric verdict split, not a symmetric one', async () => {
    const rows = [created('a', 'anime-a', 5), created('b', 'anime-b', 6), created('c', 'anime-c', 5), created('d', 'anime-d', 2)];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useSelectionBoard(source));

    await waitFor(() => expect(result.current.rows).toHaveLength(4));
    expect(result.current.groupTotals).toEqual({ approved: 3, rejected: 1 });
  });

  it('narrows the groups by criteria without touching the approved count', async () => {
    const rows = [created('a', 'anime-a', 5), created('b', 'anime-b', 2), created('c', 'anime-c', 6), created('d', 'anime-d', 0)];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useSelectionBoard(source));
    await waitFor(() => expect(result.current.rows).toHaveLength(4));

    act(() => result.current.onGroupChange('grades', ['6']));
    expect(result.current.matchingCount).toBe(1);
    expect(result.current.groups.map((group) => group.rows.map((row) => row.id))).toEqual([['c']]);
    expect(result.current.approvedCount).toBe(2);
    expect(result.current.groupTotals).toEqual({ approved: 2, rejected: 2 });

    act(() => result.current.onGroupChange('verdicts', ['rejected']));
    expect(result.current.matchingCount).toBe(0);
    expect(result.current.groups).toEqual([]);
    expect(result.current.activeFilterCount).toBe(2);
  });

  it('sorts the visible rows inside each verdict group and keeps the group totals', async () => {
    const rows = [created('a', 'anime-a', 5), created('b', 'anime-b', 2), created('c', 'anime-c', 6), created('d', 'anime-d', 0)];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useSelectionBoard(source));
    await waitFor(() => expect(result.current.rows).toHaveLength(4));

    act(() => result.current.onSortChange('grade-asc'));
    expect(result.current.groups.map((group) => [group.label, group.rows.map((row) => row.id)])).toEqual([
      ['Approved', ['a', 'c']],
      ['Rejected', ['b', 'd']],
    ]);
    expect(result.current.groupTotals).toEqual({ approved: 2, rejected: 2 });

    act(() => result.current.onSortChange('grade-desc'));
    expect(result.current.groups.map((group) => group.rows.map((row) => row.id))).toEqual([['c', 'a'], ['b', 'd']]);
  });

  it('resets the filters while keeping the order, and resets the whole view', async () => {
    const rows = [created('a', 'anime-a', 5), created('b', 'anime-b', 2), created('c', 'anime-c', 6)];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useSelectionBoard(source));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.onGroupChange('grades', ['6']));
    act(() => result.current.onSortChange('grade-desc'));
    act(() => result.current.onResetFilters());
    expect(result.current.activeFilterCount).toBe(0);
    expect(result.current.criteria.sort).toBe('grade-desc');
    expect(result.current.matchingCount).toBe(3);

    act(() => result.current.onResetView());
    expect(result.current.criteria.sort).toBe('original');
    expect(result.current.groups.map((group) => group.rows.map((row) => row.id))).toEqual([['a', 'c'], ['b']]);
  });

  it('exposes the selection-confirmed milestone from the season snapshot', async () => {
    const source = createSource({
      getSeason: vi.fn().mockResolvedValue({ id: 's1', name: 'Julio 2026', minApprovalGrade: 4, slots: 12, status: 'open', createdAt: 0, selectionConfirmedAt: 1_753_000_000_000 }),
    });
    const { result } = renderHook(() => useSelectionBoard(source));
    await waitFor(() => expect(result.current.selectionConfirmedAt).toBe(1_753_000_000_000));
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

  it('onConfirm shows a success toast with the applied counts', async () => {
    const source = createSource({
      confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 9, rejected: 10, quotaExceeded: false }),
    });
    const { result } = renderHook(() => useSelectionBoard(source));
    await act(async () => {
      await result.current.onConfirm();
    });
    expect(toastMock.success).toHaveBeenCalledWith('Reconciliation applied — 9 approved, 10 rejected.');
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it('onConfirm shows a danger toast when confirmation fails', async () => {
    const source = createSource({
      confirmSelection: vi.fn().mockResolvedValue({ status: 'quota exceeded', approved: 13, rejected: 0, quotaExceeded: true }),
    });
    const { result } = renderHook(() => useSelectionBoard(source));
    await act(async () => {
      await result.current.onConfirm();
    });
    expect(toastMock.danger).toHaveBeenCalledWith('quota exceeded');
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
