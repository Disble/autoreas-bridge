import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonSnapshot, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useSeasonWorkspace } from '../use-season-workspace';

/** Builds an open season snapshot, overriding only what a case sets. */
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

/** Builds the season port this suite drives, overriding only what a case sets. */
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
    restoreName: vi.fn().mockResolvedValue('ok'),
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
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

describe('useSeasonWorkspace', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('starts on overview and changes the active tab when selected', () => {
    const { result } = renderHook(() => useSeasonWorkspace(createSource()));

    expect(result.current.activeTab).toBe('overview');
    act(() => result.current.selectTab('evaluation'));
    expect(result.current.activeTab).toBe('evaluation');
  });

  it('keeps the active tab when the selected key is not a declared tab', () => {
    const { result } = renderHook(() => useSeasonWorkspace(createSource()));

    act(() => result.current.selectTab('evaluation'));
    act(() => result.current.selectTab('not-a-tab'));
    expect(result.current.activeTab).toBe('evaluation');
  });

  it('exposes store status and delegates past-season actions', () => {
    const source = createSource();
    const viewPastSeason = vi.fn();
    const exitPastSeason = vi.fn();
    setSeasonStoreState({ errorMessage: 'Season unavailable', readOnly: true, viewPastSeason, exitPastSeason });
    const { result } = renderHook(() => useSeasonWorkspace(source));

    expect(result.current.errorMessage).toBe('Season unavailable');
    expect(result.current.readOnly).toBe(true);
    act(() => result.current.onViewPastSeason('past-season'));
    act(() => result.current.onExitPastSeason());
    expect(viewPastSeason).toHaveBeenCalledWith(source, 'past-season');
    expect(exitPastSeason).toHaveBeenCalledWith(source);
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

  it('stays loading while the season request is unresolved and requests no animes', () => {
    const source = createSource({ getSeason: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    const { result } = renderHook(() => useSeasonWorkspace(source));

    expect(result.current.isLoading).toBe(true);
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
  });

  it('keeps loading until the open season animes resolve, requesting them once', async () => {
    let settle: (rows: []) => void = () => undefined;
    const getSeasonAnimes = vi.fn().mockReturnValue(new Promise<[]>((resolve) => (settle = resolve)));
    const source = createSource({ getSeason: vi.fn().mockResolvedValue(makeSeason()), getSeasonAnimes });
    const { result } = renderHook(() => useSeasonWorkspace(source));

    await waitFor(() => expect(getSeasonAnimes).toHaveBeenCalledTimes(1));
    expect(result.current.overview).not.toBeNull();
    expect(result.current.isLoading).toBe(true);

    await act(async () => settle([]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getSeasonAnimes).toHaveBeenCalledTimes(1);
  });

  it('stops loading and shows the error when the open season animes fail', async () => {
    const getSeasonAnimes = vi.fn().mockRejectedValue(new Error('animes down'));
    const source = createSource({ getSeason: vi.fn().mockResolvedValue(makeSeason()), getSeasonAnimes });
    const { result } = renderHook(() => useSeasonWorkspace(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.errorMessage).toBe('Failed to load intake rows');
    expect(getSeasonAnimes).toHaveBeenCalledTimes(1);
  });

  /** One preset animes request state, with whether it gates the workspace and whether it triggers a load. */
  type AnimesGateCase = {
    /** Store fields the case presets before mount. */
    readonly preset: Parameters<typeof setSeasonStoreState>[0];
    /** Whether the workspace stays gated. */
    readonly isLoading: boolean;
    /** Number of animes requests the mount must issue. */
    readonly requests: number;
  };

  it.each<AnimesGateCase>([
    { preset: { animesLoadState: 'loading' }, isLoading: true, requests: 0 },
    { preset: { animesLoadState: 'failed' }, isLoading: false, requests: 0 },
    { preset: { animesLoadState: 'loaded' }, isLoading: false, requests: 0 },
    { preset: { animesLoadState: 'idle', readOnly: true, viewSeasonId: 'past' }, isLoading: false, requests: 0 },
    { preset: { animesLoadState: 'idle', season: makeSeason({ status: 'closed' }) }, isLoading: false, requests: 0 },
  ])('gates on $preset with $requests animes requests', async ({ preset, isLoading, requests }) => {
    const season = preset.season ?? makeSeason();
    const source = createSource({ getSeason: vi.fn().mockResolvedValue(season), getSeasonAnimes: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    setSeasonStoreState({ season, hasLoaded: true, ...preset });
    const { result } = renderHook(() => useSeasonWorkspace(source));

    await act(async () => undefined);
    expect(result.current.isLoading).toBe(isLoading);
    expect(source.getSeasonAnimes).toHaveBeenCalledTimes(requests);
  });

  it('stays gated while an open season animes are idle and the load has not moved the state yet', async () => {
    const ensureAnimesLoaded = vi.fn().mockResolvedValue(undefined);
    const source = createSource({ getSeason: vi.fn().mockResolvedValue(makeSeason()) });
    setSeasonStoreState({ season: makeSeason(), hasLoaded: true, ensureAnimesLoaded });
    const { result } = renderHook(() => useSeasonWorkspace(source));

    await act(async () => undefined);
    expect(result.current.isLoading).toBe(true);
    expect(ensureAnimesLoaded).toHaveBeenCalledTimes(1);
    expect(ensureAnimesLoaded).toHaveBeenCalledWith(source);
  });

  it('requests no animes when no season is open', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSeasonWorkspace(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
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
