import { act, render, renderHook as renderBridgeHook, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonQuerySource, SeasonSource } from '../../../../../shared/contracts/season.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { BRIDGE_SEASON_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { getSeasonStoreState, resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { makeCreatedRow, makeSeasonPort } from '../../../__tests__/season-port.test-support';
import { EvaluationPanel } from '../EvaluationPanel';
import { useEvaluationPanel } from '../use-evaluation-panel';

vi.mock('../../RateAnimeModal/RateAnimeModal', () => ({ RateAnimeModal: () => null }));

/** Renders the hook with a ready season module. */
const renderHook: typeof renderBridgeHook = (callback, options) => renderBridgeHook(callback, {
  ...options,
  wrapper: createModulesTestWrapper({ module: 'season', state: 'ready' }).wrapper,
});

/** Builds the season port this suite drives, overriding only what a case sets. */
function createSource(overrides: Partial<SeasonSource & SeasonQuerySource> = {}): SeasonSource & SeasonQuerySource {
  return {
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue({ pastDownloadTime: false, downloadTime: '' }),
    triggerSeasonDownloads: vi.fn().mockResolvedValue(undefined),
    downloadSeasonAnimes: vi.fn().mockResolvedValue(undefined),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    restoreName: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    setSeasonAnimeMetadata: vi.fn().mockResolvedValue('ok'),
    createSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    saveOrderingDraft: vi.fn().mockResolvedValue('ok'),
    applySchedule: vi.fn().mockResolvedValue({ status: 'ok', applied: 0, failed: [] }),
    reopenOrdering: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    openPage: vi.fn(),
    readSeason: vi.fn().mockResolvedValue(null),
    readSeasonAnimes: vi.fn().mockResolvedValue([]),
    readSeasons: vi.fn().mockResolvedValue([]),
    readPastSeason: vi.fn().mockResolvedValue(null),
    readPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

/** Builds a created season anime row with one grade. */
function created(id: string, animeId: string, grade: number, skipGrading = false): SeasonAnimeRow {
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
    gradeSource: grade >= 1 ? 'manual' : '',
    skipGrading,
    consideration: 'none',  };
}

describe('useEvaluationPanel', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('loads candidates on mount and counts the ungraded ones', async () => {
    const rows = [created('a', 'anime-a', 0), created('b', 'anime-b', 5)];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useEvaluationPanel(source, {}));

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.ungradedCount).toBe(1);
    expect(source.readSeasonAnimes).toHaveBeenCalled();
  });

  it('lists ungraded candidates first and resolves each candidate cover once', async () => {
    const rows = [created('a', 'anime-a', 5), created('b', 'anime-b', 0), created('c', 'anime-c', 0, true)];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const getAnimeCover = vi.fn((animeId: string) => Promise.resolve({ source: 'cover', dataUrl: `data:${animeId}` }));
    const { result } = renderHook(() => useEvaluationPanel(source, { getAnimeCover }));

    await waitFor(() => expect(result.current.getCoverThumb('anime-c')).toEqual({ coverSrc: 'data:anime-c', isLoading: false }));
    expect(result.current.items.map((item) => item.row.id)).toEqual(['b', 'a', 'c']);
    expect(result.current.getCoverThumb('anime-a')).toEqual({ coverSrc: 'data:anime-a', isLoading: false });
    expect(getAnimeCover.mock.calls).toEqual([['anime-b'], ['anime-a'], ['anime-c']]);
  });

  it('reads through the query rather than the legacy store read, then records a skip override', async () => {
    const source = createSource();
    const { result } = renderHook(() => useEvaluationPanel(source, {}));
    await waitFor(() => expect(result.current.view.kind).toBe('empty'));
    expect(source.readSeasonAnimes).toHaveBeenCalled();

    await act(async () => {
      result.current.onSkip('sa-1');
    });

    expect(source.skipGrading).toHaveBeenCalledWith('sa-1');
    await waitFor(() => expect(source.readSeasonAnimes).toHaveBeenCalledTimes(2));
  });
});

describe('Evaluation panel failed refetch', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('keeps the loaded candidates and reports the failure when the refetch after a skip rejects', async () => {
    const rows = [makeCreatedRow({ id: 'row-1', rawName: 'Naruto' })];
    // An `internal` code, so the refetch does not retry and the case stays fast.
    const readSeasonAnimes = vi.fn().mockResolvedValueOnce(rows).mockRejectedValue(createBridgeError('internal', 'rows refresh failed'));
    const source = makeSeasonPort({ readSeasonAnimes, skipGrading: vi.fn().mockResolvedValue('ok') });
    const { result } = renderHook(() => useEvaluationPanel(source, { getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }) }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      result.current.onSkip('row-1');
    });
    await waitFor(() => expect(readSeasonAnimes).toHaveBeenCalledTimes(2));

    // The rejected refetch keeps the rows the screen already loaded beside the banner.
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.row.rawName).toBe('Naruto');
    await waitFor(() => expect(getSeasonStoreState().errorMessage).toBe('rows refresh failed'));
  });
});

/** A created season row for the list-window test. */
function windowRow(index: number): SeasonAnimeRow {
  return { id: String(index), rawName: `Anime ${index}`, animeId: `a${index}`, availability: 'created', matchStatus: '', matchedSlug: '', candidates: [], availableEpisodes: 0, section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: '' };
}

describe('EvaluationPanel progressive list', () => {
  afterEach(() => { vi.restoreAllMocks(); resetSeasonStore(); });

  it('renders one progressive batch rather than all candidates', async () => {
    vi.spyOn(BRIDGE_SEASON_SOURCE, 'readSeasonAnimes').mockResolvedValue(Array.from({ length: 120 }, (_, index) => windowRow(index)));
    const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
    render(createElement(EvaluationPanel, { onNavigate: vi.fn() }), { wrapper });
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('listitem').length).toBeLessThan(120);
  });
});
