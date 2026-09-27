import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import type { AnimeMetadataSelection } from '../../../../../shared/metadata-lookup/metadata-lookup.types';
import type { AnimeMetadataLookupSource } from '../../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';
import { getSeasonStoreState, resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { useIntakePanel } from '../use-intake-panel';

/**
 * Builds the preferences port the hook reads the downloads root from, so a case
 * only states the root it cares about.
 * @param root The downloads root the port reports.
 * @returns A preferences port suitable for {@link useIntakePanel}.
 */
function createDownloadsRootSource(root = 'D:/Anime') {
  return {
    getDownloadsRoot: vi.fn().mockResolvedValue(root),
  };
}

/**
 * Builds the season port every row mutation goes through, defaulting every call
 * to a benign no-op so a case only overrides the call it exercises.
 * @param overrides Per-test port replacements.
 * @returns A season port suitable for {@link useIntakePanel}.
 */
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

/**
 * Builds the one MyAnimeList call pair the hook hands each row's lookup modal,
 * resolving with no candidates so no case accidentally drives a real lookup.
 * @returns A fake lookup source suitable for {@link useIntakePanel}.
 */
function createMetadataSource(): AnimeMetadataLookupSource {
  return {
    SearchMyAnimeList: vi.fn().mockResolvedValue({ outcome: 'no_op', message: '', candidates: [] }),
    GetMyAnimeListDetail: vi.fn().mockResolvedValue({ outcome: 'no_op', message: '' }),
  };
}

/**
 * Builds an editable intake row, so a metadata case states only its id and name.
 * @param overrides Per-test row replacements.
 * @returns A pending, uncreated intake row.
 */
function seasonRow(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa-1',
    rawName: 'Dr. Stone',
    matchStatus: 'pending',
    matchedSlug: '',
    candidates: [],
    availability: 'waiting',
    availableEpisodes: 0,
    animeId: '',
    section: '',
    sectionOrder: 0,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',
    ...overrides,
  };
}

/**
 * Builds a confirmed lookup result, carrying the two mapped fields the metadata
 * cases assert on unless a case overrides them (including their removal).
 * @param overrides Per-test selection replacements.
 * @returns A confirmed lookup selection.
 */
function selection(overrides: Partial<AnimeMetadataSelection> = {}): AnimeMetadataSelection {
  return { name: 'Dr. Stone', kind: '0', unfilled: [], ...overrides };
}

/**
 * Builds a source whose intake list holds the given rows, so a case can change
 * the list mid-test and drive a real store refresh.
 * @param rows The rows the season port returns.
 * @returns A season port holding `rows`.
 */
function createSourceWithRows(rows: readonly SeasonAnimeRow[]): SeasonSource {
  return createSource({ getSeasonAnimes: vi.fn().mockResolvedValue([...rows]) });
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

  it('holds one confirmed lookup per row and hands the rows the injected lookup source', async () => {
    const metadataSource = createMetadataSource();
    const source = createSourceWithRows([seasonRow({ id: 'sa-1' }), seasonRow({ id: 'sa-2', rawName: 'Bleach' })]);
    const { result } = renderHook(() => useIntakePanel(source, createDownloadsRootSource(), metadataSource));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(2));
    expect(result.current.metadataLookupSource).toBe(metadataSource);

    act(() => result.current.onMetadataApplied('sa-1', selection()));

    expect(result.current.metadataByRow).toEqual({ 'sa-1': { name: 'Dr. Stone', kind: '0' } });
    expect(result.current.appliedMetadataByRow['sa-1']).toEqual({
      patch: { name: 'Dr. Stone', kind: '0' },
      previous: { name: undefined, kind: undefined },
      appliedFields: ['name', 'kind'],
      unfilled: [],
    });
  });

  it('refuses a lookup for a row the intake list no longer shows', async () => {
    const source = createSourceWithRows([seasonRow({ id: 'sa-1' })]);
    const { result } = renderHook(() => useIntakePanel(source, createDownloadsRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));

    act(() => result.current.onMetadataApplied('sa-9', selection()));

    expect(result.current.metadataByRow).toEqual({});
    expect(result.current.appliedMetadataByRow).toEqual({});
  });

  it('replaces the applied patch on a second apply instead of stacking it, and undo steps back one apply', async () => {
    const source = createSourceWithRows([seasonRow({ id: 'sa-1' })]);
    const { result } = renderHook(() => useIntakePanel(source, createDownloadsRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));

    act(() => result.current.onMetadataApplied('sa-1', selection()));
    act(() =>
      result.current.onMetadataApplied(
        'sa-1',
        selection({ name: 'Dr. Stone: Stone Wars', kind: undefined, genres: 'Adventure' }),
      ),
    );

    expect(result.current.appliedMetadataByRow['sa-1']?.patch).toEqual({
      name: 'Dr. Stone: Stone Wars',
      genres: 'Adventure',
    });
    expect(result.current.appliedMetadataByRow['sa-1']?.appliedFields).toEqual(['name', 'genres']);
    expect(result.current.metadataByRow['sa-1']).toEqual({
      name: 'Dr. Stone: Stone Wars',
      kind: '0',
      genres: 'Adventure',
    });

    act(() => result.current.onMetadataUndo('sa-1'));

    expect(result.current.metadataByRow['sa-1']?.name).toBe('Dr. Stone');
    expect(result.current.metadataByRow['sa-1']?.kind).toBe('0');
    expect(result.current.metadataByRow['sa-1']?.genres).toBeUndefined();
    expect(result.current.appliedMetadataByRow['sa-1']).toBeUndefined();
  });

  it('undoes nothing for a row with no applied metadata', async () => {
    const source = createSourceWithRows([seasonRow({ id: 'sa-1' })]);
    const { result } = renderHook(() => useIntakePanel(source, createDownloadsRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));

    act(() => result.current.onMetadataUndo('sa-1'));

    expect(result.current.metadataByRow).toEqual({});
  });

  it('refuses to attach metadata to a row the intake list does not show', async () => {
    const source = createSourceWithRows([seasonRow({ id: 'sa-1' })]);
    const { result } = renderHook(() => useIntakePanel(source, createDownloadsRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));

    act(() => result.current.onMetadataApplied('sa-2', selection()));

    // The lookup belongs to the row it was opened for; a stale id attaches nothing.
    expect(result.current.metadataByRow).toEqual({});
    expect(result.current.appliedMetadataByRow).toEqual({});

    // And it must not resurface later: a row that appears afterwards never owned
    // that lookup, so it cannot inherit an autofill nobody confirmed for it.
    await act(async () => {
      await getSeasonStoreState().refreshAnimes(
        createSourceWithRows([seasonRow({ id: 'sa-1' }), seasonRow({ id: 'sa-2', rawName: 'Bleach' })]),
      );
    });
    expect(result.current.metadataByRow['sa-2']).toBeUndefined();
    expect(result.current.appliedMetadataByRow['sa-2']).toBeUndefined();
  });

  it('undoes only the row it was asked for, leaving another row\'s applied metadata in place', async () => {
    const rows = [seasonRow({ id: 'sa-1' }), seasonRow({ id: 'sa-2', rawName: 'Bleach' })];
    const source = createSourceWithRows(rows);
    const { result } = renderHook(() => useIntakePanel(source, createDownloadsRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(2));
    act(() => result.current.onMetadataApplied('sa-1', selection()));
    act(() => result.current.onMetadataApplied('sa-2', selection({ name: 'Bleach', kind: undefined })));

    act(() => result.current.onMetadataUndo('sa-1'));

    // Undoing one row restores that row's pre-image and drops its Undo...
    expect(result.current.metadataByRow['sa-1']).toEqual({});
    expect(result.current.appliedMetadataByRow['sa-1']).toBeUndefined();
    // ...while the other row keeps both its metadata and its Undo.
    expect(result.current.metadataByRow['sa-2']?.name).toBe('Bleach');
    expect(result.current.appliedMetadataByRow['sa-2']?.appliedFields).toEqual(['name']);
  });

  it('keeps the metadata across a refreshed, reordered list and drops it with the row that left', async () => {
    const rows = [seasonRow({ id: 'sa-1' }), seasonRow({ id: 'sa-2', rawName: 'Bleach' }) ];
    const source = createSourceWithRows(rows);
    const { result } = renderHook(() => useIntakePanel(source, createDownloadsRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(2));
    act(() => result.current.onMetadataApplied('sa-1', selection()));

    // A reordered refresh keeps the row ids, so the lookup stays attached.
    await act(async () => {
      await getSeasonStoreState().refreshAnimes(createSourceWithRows([rows[1], rows[0]]));
    });
    expect(result.current.metadataByRow['sa-1']).toEqual({ name: 'Dr. Stone', kind: '0' });

    // A refresh without that row drops its lookup with it.
    await act(async () => {
      await getSeasonStoreState().refreshAnimes(createSourceWithRows([rows[1]]));
    });
    expect(result.current.metadataByRow['sa-1']).toBeUndefined();
    expect(result.current.appliedMetadataByRow['sa-1']).toBeUndefined();
  });
});
