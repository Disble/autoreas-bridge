import { act, renderHook as renderQueryHook, waitFor } from '@testing-library/react';
import { seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  SeasonAnimeRow,
  SeasonMatchingFinishedNotice,
  SeasonMatchingProgressNotice,
  SeasonMatchingStartedNotice,
} from '../../../../../shared/contracts/season.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { settingsKeys } from '../../../../../shared/query/query-keys/query-keys.constants';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { disconnectSeasonMatchingStore, getSeasonStoreState, resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { createLibraryRootSource, createMetadataSource, createSource, createSourceWithRows, seasonRow, selection } from './intake-panel.test-support';
import { useIntakePanel } from '../use-intake-panel';

/**
 * Mounts each panel case with its own season query cache, or with the cache a
 * case passes so its assertions act on the client the hook actually uses.
 */
const renderHook: typeof renderQueryHook = (callback, options) =>
  renderQueryHook(callback, { ...options, wrapper: options?.wrapper ?? seasonQueryWrapper().wrapper });

describe('useIntakePanel', () => {
  afterEach(() => {
    disconnectSeasonMatchingStore();
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('reads rows on mount, creates the picked rows, then resolves, discards and opens pages through the source', async () => {
    const source = createSource();
    const { result } = renderHook(() => useIntakePanel(source));
    await waitFor(() => expect(source.readSeasonAnimes).toHaveBeenCalled());

    act(() => result.current.toggleSelect('sa-1'));
    act(() => result.current.toggleSelect('sa-2'));
    expect(result.current.selected.size).toBe(2);
    await act(async () => {
      result.current.onCreate();
    });
    expect(source.createSeasonAnimes).toHaveBeenCalledWith(['sa-1', 'sa-2'], {}, {});
    expect(result.current.selected.size).toBe(0);

    await act(async () => {
      result.current.onResolve('sa-1', 'https://jkanime.net/dr-stone/');
    });
    await act(async () => {
      result.current.onDiscard('sa-2');
    });
    expect(source.resolveMatch).toHaveBeenCalledWith('sa-1', 'https://jkanime.net/dr-stone/');
    expect(source.discardName).toHaveBeenCalledWith('sa-2');

    await act(async () => {
      result.current.onOpenPage('https://jkanime.net/dr-stone/');
    });
    expect(source.openPage).toHaveBeenCalledWith('https://jkanime.net/dr-stone/');
  });

  it('keeps only editable rows (created rows leave intake) and counts unresolved + available', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'a', rawName: 'A', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
      { id: 'b', rawName: 'B', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'available', availableEpisodes: 2, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
      { id: 'c', rawName: 'C', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'created', availableEpisodes: 0, animeId: 'anime-c', section: 'Sin ver', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
    ];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useIntakePanel(source));

    await waitFor(() => expect(result.current.editableRows).toHaveLength(2)); // a + b; c (created) excluded
    expect(result.current.unresolvedCount).toBe(1); // a pending
    expect(result.current.availableCount).toBe(1); // b available
  });

  it('surfaces a failed search as its own counter, outside the unresolved count', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'a', rawName: 'A', matchStatus: 'search_failed', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
      { id: 'b', rawName: 'B', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
    ];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useIntakePanel(source));

    await waitFor(() => expect(result.current.editableRows).toHaveLength(2));
    expect(result.current.searchFailedCount).toBe(1);
    expect(result.current.unresolvedCount).toBe(1); // the failed search is not pending work
  });

  it('follows a matching run live: progress names its phase and patches its row', async () => {
    const subscribeStarted = vi.fn().mockReturnValue(() => undefined);
    const subscribeProgress = vi.fn().mockReturnValue(() => undefined);
    const subscribeFinished = vi.fn().mockReturnValue(() => undefined);
    const source = createSource({
      readSeasonAnimes: vi.fn().mockResolvedValue([seasonRow({ id: 'sa-1', rawName: 'Good Anime' })]),
      subscribeMatchingStarted: subscribeStarted,
      subscribeMatchingProgress: subscribeProgress,
      subscribeMatchingFinished: subscribeFinished,
    });
    const { result } = renderHook(() => useIntakePanel(source));
    await waitFor(() => expect(source.readSeasonAnimes).toHaveBeenCalledTimes(1));
    const started = subscribeStarted.mock.calls[0][0] as (notice: SeasonMatchingStartedNotice) => void;
    const progress = subscribeProgress.mock.calls[0][0] as (notice: SeasonMatchingProgressNotice) => void;
    const finished = subscribeFinished.mock.calls[0][0] as (notice: SeasonMatchingFinishedNotice) => void;

    act(() => {
      started({ seasonId: 'season-1', total: 1 });
    });
    expect(result.current.matchingProgressMessage).toBe('Matching names… 0 of 1');

    act(() => {
      progress({
        seasonId: 'season-1',
        phase: 'name_matching',
        rowId: 'sa-1',
        rawName: 'Good Anime',
        matchStatus: 'matched',
        matchedSlug: 'https://jkanime.net/good-anime/',
        candidates: [],
        availability: 'waiting',
        availableEpisodes: 0,
      });
    });
    expect(result.current.matchingProgressMessage).toBe('Matching names… 1 of 1');
    expect(result.current.editableRows[0]).toMatchObject({ matchStatus: 'matched' });

    act(() => {
      finished({ seasonId: 'season-1' });
    });
    // The run's progress is gone with the run, so the row falls back to what the
    // query holds; the rows themselves reload through the finished event's
    // invalidation (`use-displayed-season.test.ts`), never from here.
    expect(result.current.matchingProgressMessage).toBeUndefined();
    expect(getSeasonStoreState().matchingProgress).toEqual({});
  });

  it('onPickFolder records a per-row override that onCreate forwards for that row only', async () => {
    const source = createSource();
    const picker = { pickFolder: vi.fn().mockResolvedValue('E:/Custom/Naruto S2'), pickFile: vi.fn() };
    const { result } = renderHook(() => useIntakePanel(source, createLibraryRootSource(), createMetadataSource(), picker));

    act(() => result.current.toggleSelect('sa-1'));
    act(() => result.current.toggleSelect('sa-2'));
    await act(async () => {
      result.current.onPickFolder('sa-2');
    });
    expect(result.current.folderOverrides['sa-2']).toBe('E:/Custom/Naruto S2');

    await act(async () => {
      result.current.onCreate();
    });
    expect(source.createSeasonAnimes).toHaveBeenCalledWith(['sa-1', 'sa-2'], { 'sa-2': 'E:/Custom/Naruto S2' }, {});
  });

  it('exposes the default download folder preview for creatable rows', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'sa-1', rawName: 'Re:Zero', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'available', availableEpisodes: 1, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
    ];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const libraryRootSource = createLibraryRootSource('D:/Anime');
    const { client, wrapper } = createModulesTestWrapper(status('season', 'ready'), status('settings', 'ready'));
    const { result } = renderHook(() => useIntakePanel(source, libraryRootSource), { wrapper });

    await waitFor(() => expect(result.current.folderPreviews['sa-1']).toBe('D:/Anime/Re Zero'));
    expect(libraryRootSource.getLibraryRoot).toHaveBeenCalledTimes(1);
    // The same cache entry the anime create form reads, so both share one library-root read.
    expect(client.getQueryData(settingsKeys.key('library-root'))).toBe('D:/Anime');
  });

  it.each([
    ['while the settings module starts', status('settings', 'starting'), 0],
    ['once the library-root read failed', status('settings', 'ready'), 1],
  ] as const)('shows no default folder preview %s', async (_case, settings, reads) => {
    const rows: SeasonAnimeRow[] = [
      { id: 'sa-1', rawName: 'Re:Zero', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'available', availableEpisodes: 1, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
    ];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const libraryRootSource = { getLibraryRoot: vi.fn().mockRejectedValue(createBridgeError('internal', 'read settings failed')) };
    const { wrapper } = createModulesTestWrapper(status('season', 'ready'), settings);
    const { result } = renderHook(() => useIntakePanel(source, libraryRootSource), { wrapper });

    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));
    await waitFor(() => expect(libraryRootSource.getLibraryRoot).toHaveBeenCalledTimes(reads));
    expect(result.current.folderPreviews).toEqual({});
  });

  it('ignores a cancelled folder picker (no override recorded)', async () => {
    const source = createSource();
    const picker = { pickFolder: vi.fn().mockResolvedValue(''), pickFile: vi.fn() };
    const { result } = renderHook(() => useIntakePanel(source, createLibraryRootSource(), createMetadataSource(), picker));

    act(() => result.current.toggleSelect('sa-1'));
    await act(async () => {
      result.current.onPickFolder('sa-1');
    });
    expect(result.current.folderOverrides['sa-1']).toBeUndefined();

    await act(async () => {
      result.current.onCreate();
    });
    expect(source.createSeasonAnimes).toHaveBeenCalledWith(['sa-1'], {}, {});
  });

  it('sends a row STORED metadata to creation even without re-confirming it this session', async () => {
    const source = createSourceWithRows([
      seasonRow({
        id: 'sa-1',
        metadata: { kind: 2, totalEpisodes: 12 },
      }),
    ]);
    const { result } = renderHook(() => useIntakePanel(source, createLibraryRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));
    expect(result.current.metadataByRow['sa-1']?.kind).toBe('2');
    act(() => result.current.toggleSelect('sa-1'));

    await act(async () => {
      result.current.onCreate();
    });

    // The row displays what storage holds, so creation must receive the same
    // values — otherwise the user creates a different anime than the one shown.
    expect(source.createSeasonAnimes).toHaveBeenCalledWith(['sa-1'], {}, { 'sa-1': { kind: 2, totalEpisodes: 12 } });
  });

  it('sends the confirmed metadata of exactly the picked rows, converted to the create contract', async () => {
    const source = createSourceWithRows([seasonRow({ id: 'sa-1' }), seasonRow({ id: 'sa-2', rawName: 'Bleach' })]);
    const { result } = renderHook(() => useIntakePanel(source, createLibraryRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(2));
    act(() => result.current.onMetadataApplied('sa-1', selection({ kind: '0', totalEpisodes: '24', duration: '45', genres: 'Action, Fantasy', studios: 'Madhouse' })));
    // A lookup attached to a row the user did NOT pick must not travel with the batch.
    act(() => result.current.onMetadataApplied('sa-2', selection({ name: 'Bleach' })));
    act(() => result.current.toggleSelect('sa-1'));

    await act(async () => {
      result.current.onCreate();
    });

    expect(source.createSeasonAnimes).toHaveBeenCalledWith(
      ['sa-1'],
      {},
      { 'sa-1': { kind: 0, totalEpisodes: 24, durationMinutes: 45, genres: ['Action', 'Fantasy'], studios: ['Madhouse'] } },
    );
  });

  it('switching to raw builds the draft from editable names and switching back flushes', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'a', rawName: 'Anime A', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
      { id: 'b', rawName: 'Anime B', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'created', availableEpisodes: 0, animeId: 'anime-b', section: 'Sin ver', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
    ];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
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

  it('exposes matched rows waiting for availability and rechecks them on demand', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'a', rawName: 'Anime A', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
      { id: 'b', rawName: 'Anime B', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'available', availableEpisodes: 1, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' },
    ];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
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
    const { result } = renderHook(() => useIntakePanel(source, createLibraryRootSource(), metadataSource));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(2));
    expect(result.current.metadataLookupSource).toBe(metadataSource);

    act(() => result.current.onMetadataApplied('sa-1', selection()));

    expect(result.current.metadataByRow).toEqual({ 'sa-1': { name: 'Dr. Stone', kind: '0' } });
    expect(result.current.appliedMetadataByRow['sa-1']).toEqual({
      patch: { name: 'Dr. Stone', kind: '0' },
      previous: { name: undefined, kind: undefined },
      appliedFields: ['name', 'kind'],
      unfilled: [],
      canUndo: true,
    });
  });

  it('ignores undo, clear and lookups it cannot own, then persists, clears, replaces and undoes one row', async () => {
    const source = createSourceWithRows([seasonRow({ id: 'sa-1' })]);
    const { result } = renderHook(() => useIntakePanel(source, createLibraryRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));

    // Undo does nothing for a row with no applied metadata.
    act(() => result.current.onMetadataUndo('sa-1'));
    expect(result.current.metadataByRow).toEqual({});

    // Clearing a row the intake list does not show writes nothing.
    act(() => result.current.onMetadataClear('sa-gone'));
    expect(source.setSeasonAnimeMetadata).not.toHaveBeenCalled();

    // A lookup for a row the list no longer shows is refused, persist included.
    act(() => result.current.onMetadataApplied('sa-9', selection()));
    expect(result.current.metadataByRow).toEqual({});
    expect(result.current.appliedMetadataByRow).toEqual({});
    expect(source.setSeasonAnimeMetadata).not.toHaveBeenCalled();

    await act(async () => result.current.onMetadataApplied('sa-1', selection({ kind: '0', totalEpisodes: '24', genres: 'Action' })));

    // Exactly the fields creation will receive, so what the row shows and what the
    // anime gets cannot drift.
    expect(source.setSeasonAnimeMetadata).toHaveBeenCalledWith('sa-1', '{"kind":0,"totalEpisodes":24,"genres":["Action"]}');

    await act(async () => result.current.onMetadataClear('sa-1'));

    // Clear removes the stored record AND the local state the user sees.
    expect(source.setSeasonAnimeMetadata).toHaveBeenLastCalledWith('sa-1', '');
    expect(result.current.metadataByRow['sa-1']).toBeUndefined();
    expect(result.current.appliedMetadataByRow['sa-1']).toBeUndefined();

    // A second apply replaces the applied patch instead of stacking it.
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

    // Undo steps back one apply.
    act(() => result.current.onMetadataUndo('sa-1'));

    expect(result.current.metadataByRow['sa-1']?.name).toBe('Dr. Stone');
    expect(result.current.metadataByRow['sa-1']?.kind).toBe('0');
    expect(result.current.metadataByRow['sa-1']?.genres).toBeUndefined();
    // The first apply's values are still held, so the summary stays — without an
    // Undo, because this session no longer holds a pre-image for them.
    expect(result.current.appliedMetadataByRow['sa-1']?.patch).toEqual({ name: 'Dr. Stone', kind: '0' });
    expect(result.current.appliedMetadataByRow['sa-1']?.canUndo).toBe(false);
  });

  it('seeds a row from its STORED metadata, so a saved choice survives a reload', async () => {
    const source = createSourceWithRows([
      seasonRow({
        id: 'sa-1',
        metadata: { kind: 0, totalEpisodes: 24, durationMinutes: 45, origin: 'Manga', genres: ['Action', 'Fantasy'], studios: ['Madhouse'], cover: { type: 'url', path: 'https://c.jpg' } },
      }),
    ]);
    const { result } = renderHook(() => useIntakePanel(source, createLibraryRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));

    // Nothing was applied in this session, yet the row shows what storage holds.
    expect(result.current.metadataByRow['sa-1']).toEqual({
      kind: '0',
      totalEpisodes: '24',
      duration: '45',
      origin: 'Manga',
      genres: 'Action, Fantasy',
      studios: 'Madhouse',
      coverURL: 'https://c.jpg',
    });
    expect(result.current.appliedMetadataByRow['sa-1']?.appliedFields).toEqual([
      'kind',
      'totalEpisodes',
      'duration',
      'origin',
      'genres',
      'studios',
      'coverURL',
    ]);
    // Storage holds no pre-image, so the summary offers no Undo — Clear is how it goes.
    expect(result.current.appliedMetadataByRow['sa-1']?.canUndo).toBe(false);
    // Nothing came from this session's lookup, so there is no unfilled report.
    expect(result.current.appliedMetadataByRow['sa-1']?.unfilled).toEqual([]);
  });

  it('clears only the row it was asked for, leaving another row session metadata alone', async () => {
    const source = createSourceWithRows([seasonRow({ id: 'sa-1' }), seasonRow({ id: 'sa-2', rawName: 'Bleach' })]);
    const { result } = renderHook(() => useIntakePanel(source, createLibraryRootSource(), createMetadataSource()));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(2));
    await act(async () => { await result.current.onMetadataApplied('sa-1', selection()); });
    await act(async () => result.current.onMetadataApplied('sa-2', selection({ name: 'Bleach' })));

    await act(async () => result.current.onMetadataClear('sa-1'));

    expect(source.setSeasonAnimeMetadata).toHaveBeenLastCalledWith('sa-1', '');
    expect(result.current.metadataByRow['sa-1']).toBeUndefined();
    expect(result.current.appliedMetadataByRow['sa-1']).toBeUndefined();
    // The other row keeps its metadata AND its session Undo.
    expect(result.current.metadataByRow['sa-2']?.name).toBe('Bleach');
    expect(result.current.appliedMetadataByRow['sa-2']?.canUndo).toBe(true);
  });

  it('refuses to attach metadata to a row the intake list does not show', async () => {
    const source = createSourceWithRows([seasonRow({ id: 'sa-1' })]);
    const { client, wrapper } = seasonQueryWrapper();
    const { result } = renderQueryHook(() => useIntakePanel(source, createLibraryRootSource(), createMetadataSource()), { wrapper });
    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));

    act(() => result.current.onMetadataApplied('sa-2', selection()));

    // The lookup belongs to the row it was opened for; a stale id attaches nothing.
    expect(result.current.metadataByRow).toEqual({});
    expect(result.current.appliedMetadataByRow).toEqual({});

    // And it must not resurface later: a row that appears afterwards never owned
    // that lookup, so it cannot inherit an autofill nobody confirmed for it.
    await act(async () => {
      vi.mocked(source.readSeasonAnimes).mockResolvedValue([seasonRow({ id: 'sa-1' }), seasonRow({ id: 'sa-2', rawName: 'Bleach' })]);
      await client.invalidateQueries();
    });
    await waitFor(() => expect(result.current.editableRows).toHaveLength(2));
    expect(result.current.metadataByRow['sa-2']).toBeUndefined();
    expect(result.current.appliedMetadataByRow['sa-2']).toBeUndefined();
  });

  it('undoes only the row it was asked for, leaving another row\'s applied metadata in place', async () => {
    const rows = [seasonRow({ id: 'sa-1' }), seasonRow({ id: 'sa-2', rawName: 'Bleach' })];
    const source = createSourceWithRows(rows);
    const { result } = renderHook(() => useIntakePanel(source, createLibraryRootSource(), createMetadataSource()));
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
    // Its session pre-image survived the undo, so the row still offers the Undo.
    expect(result.current.appliedMetadataByRow['sa-2']?.canUndo).toBe(true);
  });

  it('keeps the metadata across a refreshed, reordered list and drops it with the row that left', async () => {
    const rows = [seasonRow({ id: 'sa-1' }), seasonRow({ id: 'sa-2', rawName: 'Bleach' }) ];
    const source = createSourceWithRows(rows);
    const { wrapper, client: queryClient } = seasonQueryWrapper();
    const { result } = renderQueryHook(() => useIntakePanel(source, createLibraryRootSource(), createMetadataSource()), { wrapper });
    await waitFor(() => expect(result.current.editableRows).toHaveLength(2));
    // Awaited: the applied metadata runs a command that refreshes the rows, so the
    // refetch it starts must settle before a later refresh reorders the list.
    await act(async () => { await result.current.onMetadataApplied('sa-1', selection()); });

    // A reordered refresh keeps the row ids, so the lookup stays attached.
    await act(async () => {
      vi.mocked(source.readSeasonAnimes).mockResolvedValue([rows[1], rows[0]]);
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(result.current.editableRows.map((row) => row.id)).toEqual(['sa-2', 'sa-1']));
    expect(result.current.metadataByRow['sa-1']).toEqual({ name: 'Dr. Stone', kind: '0' });

    // A refresh without that row drops its lookup with it.
    await act(async () => {
      vi.mocked(source.readSeasonAnimes).mockResolvedValue([rows[1]]);
      await queryClient.invalidateQueries();
    });
    // Awaited: React Query publishes a refetch to the component on a scheduled
    // macrotask, so the row leaving the list is observed before its lookup is.
    await waitFor(() => expect(result.current.editableRows.map((row) => row.id)).toEqual(['sa-2']));
    expect(result.current.metadataByRow['sa-1']).toBeUndefined();
    expect(result.current.appliedMetadataByRow['sa-1']).toBeUndefined();
  });
});
