import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { useIntakePanel } from '../use-intake-panel';

function createDownloadsRootSource(root = 'D:/Anime') {
  return {
    getDownloadsRoot: vi.fn().mockResolvedValue(root),
  };
}

function createSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(null),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue([] as SeasonAnimeRow[]),
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

describe('useIntakePanel', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('refreshes the intake rows on mount', async () => {
    const source = createSource();
    renderHook(() => useIntakePanel(source));
    await waitFor(() => expect(source.getSeasonAnimes).toHaveBeenCalled());
  });

  it('keeps only editable rows (created rows leave intake) and counts unresolved + available', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'a', rawName: 'A', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
      { id: 'b', rawName: 'B', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'available', availableEpisodes: 2, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
      { id: 'c', rawName: 'C', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'created', availableEpisodes: 0, animeId: 'anime-c', section: 'Sin ver', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
    ];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useIntakePanel(source));

    await waitFor(() => expect(result.current.editableRows).toHaveLength(2)); // a + b; c (created) excluded
    expect(result.current.unresolvedCount).toBe(1); // a pending
    expect(result.current.availableCount).toBe(1); // b available
  });

  it('toggleSelect then onCreate creates the picked rows and clears the selection', async () => {
    const source = createSource();
    const { result } = renderHook(() => useIntakePanel(source));
    act(() => result.current.toggleSelect('sa-1'));
    act(() => result.current.toggleSelect('sa-2'));
    expect(result.current.selected.size).toBe(2);

    await act(async () => {
      result.current.onCreate();
    });
    expect(source.createSeasonAnimes).toHaveBeenCalledWith(['sa-1', 'sa-2'], {});
    expect(result.current.selected.size).toBe(0);
  });

  it('onPickFolder records a per-row override that onCreate forwards for that row only', async () => {
    const source = createSource({ pickFolder: vi.fn().mockResolvedValue('E:/Custom/Naruto S2') });
    const { result } = renderHook(() => useIntakePanel(source));

    act(() => result.current.toggleSelect('sa-1'));
    act(() => result.current.toggleSelect('sa-2'));
    await act(async () => {
      result.current.onPickFolder('sa-2');
    });
    expect(result.current.folderOverrides['sa-2']).toBe('E:/Custom/Naruto S2');

    await act(async () => {
      result.current.onCreate();
    });
    expect(source.createSeasonAnimes).toHaveBeenCalledWith(['sa-1', 'sa-2'], { 'sa-2': 'E:/Custom/Naruto S2' });
  });

  it('exposes the default download folder preview for creatable rows', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'sa-1', rawName: 'Re:Zero', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'available', availableEpisodes: 1, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
    ];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const downloadsRootSource = createDownloadsRootSource('D:/Anime');
    const { result } = renderHook(() => useIntakePanel(source, downloadsRootSource));

    await waitFor(() => expect(downloadsRootSource.getDownloadsRoot).toHaveBeenCalled());
    expect(result.current.folderPreviews['sa-1']).toBe('D:/Anime/Re Zero');
  });

  it('ignores a cancelled folder picker (no override recorded)', async () => {
    const source = createSource({ pickFolder: vi.fn().mockResolvedValue('') });
    const { result } = renderHook(() => useIntakePanel(source));

    act(() => result.current.toggleSelect('sa-1'));
    await act(async () => {
      result.current.onPickFolder('sa-1');
    });
    expect(result.current.folderOverrides['sa-1']).toBeUndefined();

    await act(async () => {
      result.current.onCreate();
    });
    expect(source.createSeasonAnimes).toHaveBeenCalledWith(['sa-1'], {});
  });

  it('switching to raw builds the draft from editable names and switching back flushes', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'a', rawName: 'Anime A', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
      { id: 'b', rawName: 'Anime B', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'created', availableEpisodes: 0, animeId: 'anime-b', section: 'Sin ver', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
    ];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useIntakePanel(source));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));

    await act(async () => {
      result.current.switchMode('raw');
    });
    expect(result.current.rawDraft).toBe('Anime A'); // created anime excluded

    await act(async () => {
      result.current.onRawChange('Anime A\nAnime C');
    });
    await act(async () => {
      result.current.switchMode('list');
    });
    expect(source.reconcileIntake).toHaveBeenCalledWith('Anime A\nAnime C');
  });

  it('onResolve and onDiscard delegate to the source', async () => {
    const source = createSource();
    const { result } = renderHook(() => useIntakePanel(source));
    await act(async () => {
      result.current.onResolve('sa-1', 'https://jkanime.net/dr-stone/');
    });
    await act(async () => {
      result.current.onDiscard('sa-2');
    });
    expect(source.resolveMatch).toHaveBeenCalledWith('sa-1', 'https://jkanime.net/dr-stone/');
    expect(source.discardName).toHaveBeenCalledWith('sa-2');
  });

  it('onOpenPage delegates the matched slug to the source', async () => {
    const source = createSource();
    const { result } = renderHook(() => useIntakePanel(source));
    await act(async () => {
      result.current.onOpenPage('https://jkanime.net/dr-stone/');
    });
    expect(source.openPage).toHaveBeenCalledWith('https://jkanime.net/dr-stone/');
  });

  it('exposes matched rows waiting for availability and rechecks them on demand', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'a', rawName: 'Anime A', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
      { id: 'b', rawName: 'Anime B', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'available', availableEpisodes: 1, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
    ];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useIntakePanel(source));

    await waitFor(() => expect(result.current.availabilityPendingCount).toBe(1));
    await act(async () => {
      result.current.onRecheckAvailability();
    });

    expect(source.recheckAvailability).toHaveBeenCalled();
  });
});
