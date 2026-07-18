import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonSnapshot, SeasonSource } from '../../../../../infrastructure/season-source';
import { resetSeasonStore } from '../../../../../shared/store/season-store';
import { useSeasonWorkspace } from '../use-season-workspace';

function makeSeason(overrides: Partial<SeasonSnapshot> = {}): SeasonSnapshot {
  return {
    id: 'season-1',
    name: 'Julio 2026',
    minApprovalGrade: 4,
    slots: 12,
    status: 'open',
    createdAt: Date.UTC(2026, 6, 6),
    ...overrides,
  };
}

function createSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
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

describe('useSeasonWorkspace', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('refreshes on mount and exposes a null overview when no season is open', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSeasonWorkspace(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(source.getSeason).toHaveBeenCalled();
    expect(result.current.season).toBeNull();
    expect(result.current.overview).toBeNull();
  });

  it('builds the overview view model for an open season', async () => {
    const source = createSource({ getSeason: vi.fn().mockResolvedValue(makeSeason()) });
    const { result } = renderHook(() => useSeasonWorkspace(source));

    await waitFor(() => expect(result.current.overview).not.toBeNull());
    expect(result.current.overview?.title).toBe('Julio 2026');
    expect(result.current.overview?.statusLabel).toBe('Open');
    expect(result.current.overview?.minApprovalGrade).toBe(4);
  });

  it('exposes a date-derived suggested name', () => {
    const source = createSource();
    const { result } = renderHook(() => useSeasonWorkspace(source));
    expect(result.current.suggestedName).toMatch(/^[A-Za-zÁÉÍÓÚáéíóú]+ \d{4}$/);
  });

  it('onCreateSeason delegates to the source and refreshes', async () => {
    const getSeason = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(makeSeason());
    const source = createSource({ getSeason });
    const { result } = renderHook(() => useSeasonWorkspace(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      result.current.onCreateSeason('Julio 2026');
    });

    await waitFor(() => expect(source.createSeason).toHaveBeenCalledWith('Julio 2026'));
    await waitFor(() => expect(result.current.season?.name).toBe('Julio 2026'));
  });

  it('onCloseSeason delegates to the source', async () => {
    const source = createSource({ getSeason: vi.fn().mockResolvedValue(makeSeason()) });
    const { result } = renderHook(() => useSeasonWorkspace(source));

    await waitFor(() => expect(result.current.overview).not.toBeNull());
    await act(async () => {
      result.current.onCloseSeason();
    });

    expect(source.closeSeason).toHaveBeenCalled();
  });
});
