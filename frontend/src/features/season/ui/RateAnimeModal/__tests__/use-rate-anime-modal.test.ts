import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonSource } from '../../../../../shared/contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { SEASON_ANIMES_KEY } from '../../../../../shared/query/query-keys/query-keys.constants';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { useBridgeQuery } from '../../../../../shared/query/use-bridge-query/use-bridge-query';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useRateAnimeModal } from '../use-rate-anime-modal';

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
    triggerSeasonDownloads: vi.fn().mockResolvedValue(undefined),
    downloadSeasonAnimes: vi.fn().mockResolvedValue(undefined),
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

describe('useRateAnimeModal', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('refreshes the shared rows after a grade is recorded', async () => {
    const read = vi.fn().mockResolvedValue([]);
    const source = createSource();
    const querySource = { ...BRIDGE_SEASON_SOURCE, readSeasonAnimes: read };
    const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
    const { result } = renderHook(() => {
      useBridgeQuery({ queryKey: SEASON_ANIMES_KEY, queryFn: read, module: 'season' });
      return useRateAnimeModal('anime-a', source, querySource);
    }, { wrapper });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));

    await act(async () => { result.current.onSelectGrade(5); });

    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it('keeps the rows and reports a refused grade without refreshing', async () => {
    const read = vi.fn().mockResolvedValue([]);
    const source = createSource({ setGrade: vi.fn().mockResolvedValue('refused') });
    const querySource = { ...BRIDGE_SEASON_SOURCE, readSeasonAnimes: read };
    const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
    const { result } = renderHook(() => {
      useBridgeQuery({ queryKey: SEASON_ANIMES_KEY, queryFn: read, module: 'season' });
      return useRateAnimeModal('anime-a', source, querySource);
    }, { wrapper });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await act(async () => { result.current.onSelectGrade(5); });
    await waitFor(() => expect(getSeasonStoreState().errorMessage).toBe('refused'));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not write in a read-only season', async () => {
    setSeasonStoreState({ readOnly: true });
    const source = createSource();
    const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
    const { result } = renderHook(() => useRateAnimeModal('anime-a', source), { wrapper });
    await act(async () => { result.current.onSelectGrade(5); });
    expect(source.setGrade).not.toHaveBeenCalled();
  });

  it('records the picked grade against the anime', async () => {
    const source = createSource();
    const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
    const { result } = renderHook(() => useRateAnimeModal('anime-a', source), { wrapper });

    await act(async () => {
      result.current.onSelectGrade(5);
    });

    expect(source.setGrade).toHaveBeenCalledWith('anime-a', 5);
  });
});
