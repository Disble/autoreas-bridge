import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { AnimeEditorRecord } from '../../../../../shared/contracts/anime.types';
import type { AnimeMetadataSelection } from '../../../../../shared/metadata-lookup/metadata-lookup.types';
import { isIntentionalEditorOutcome } from '../anime-editor-workspace.helpers';
import { useAnimeEditorRecord } from '../use-anime-editor-record';

/**
 * Builds a stubbed editor runtime source for one hook test case.
 * @param overrides Bindings to replace on the default stub.
 * @returns The stubbed source.
 */
function createSource(overrides: Partial<AnimeEditorRuntimeSource>): AnimeEditorRuntimeSource {
  return {
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeEditorRecord: vi.fn(),
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    restoreAnime: vi.fn(),
    repeatAnime: vi.fn(),
    getAnimeEditorScheduleBoard: vi.fn(),
    applyAnimeEditorSchedule: vi.fn(),
    pickFolder: vi.fn().mockResolvedValue(''),
    pickFile: vi.fn().mockResolvedValue(''),
    ...overrides,
  } as unknown as AnimeEditorRuntimeSource;
}

/**
 * Builds one editor record with every never-touched field (Download page,
 * Folder, Watched episodes, the watching estado, premiere date) populated,
 * so a test can assert those survive a metadata autofill byte-identical.
 * @param overrides Per-test field replacements.
 * @returns The record.
 */
function record(overrides: Partial<AnimeEditorRecord> = {}): AnimeEditorRecord {
  return {
    animeId: 'anime-1',
    modifiedAt: 100,
    frequent: {
      name: 'Bleach',
      status: 1,
      progress: 12,
      totalEpisodes: 20,
      active: true,
      kind: 0,
      page: 'https://example.test/bleach',
      folder: 'D:/Anime/Bleach',
      placements: [],
    },
    details: {
      premieredAt: 1000,
      duration: 24,
      origin: 'Manga',
      genres: [],
      studios: { kind: 'missing', values: [] },
    },
    ...overrides,
  };
}

describe('editor record outcome policy', () => {
  it('clears drafts only for applied and no-op outcomes', () => {
    expect(isIntentionalEditorOutcome({ outcome: 'applied', message: 'ok' })).toBe(true);
    expect(isIntentionalEditorOutcome({ outcome: 'no_op', message: 'ok' })).toBe(true);
    expect(isIntentionalEditorOutcome({ outcome: 'conflict', message: 'stale' })).toBe(false);
    expect(isIntentionalEditorOutcome({ outcome: 'error', message: 'failed' })).toBe(false);
  });
});

describe('editor record folder picker', () => {
  it('applies the picked folder path to the draft', async () => {
    const source = createSource({ pickFolder: vi.fn().mockResolvedValue('D:/Anime/New Show') });
    const { result } = renderHook(() => useAnimeEditorRecord({ source }));

    await act(async () => { await result.current.onPickFolder(); });

    expect(source.pickFolder).toHaveBeenCalledWith('Select anime folder');
    expect(result.current.draft.folder).toBe('D:/Anime/New Show');
  });

  it('leaves the folder unchanged when the picker is cancelled', async () => {
    const source = createSource({ pickFolder: vi.fn().mockResolvedValue('') });
    const { result } = renderHook(() => useAnimeEditorRecord({ source }));

    await act(async () => { await result.current.onPickFolder(); });

    expect(result.current.draft.folder).toBe('');
  });
});

describe('editor record restore handler', () => {
  /** Authority fixture shared by both restore cases below. */
  const selectedRecord = {
    animeId: 'anime-1',
    modifiedAt: 42,
    frequent: { name: 'Frieren', status: 1, progress: 3, totalEpisodes: 28, active: false, kind: 1, page: '', folder: '', placements: [] },
    details: { genres: [], studios: { kind: 'values' as const, values: [] } },
  };

  it('calls restoreAnime, reloads the record on success, and reports Restore feedback', async () => {
    const source = createSource({
      getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', record: selectedRecord }),
      restoreAnime: vi.fn().mockResolvedValue({ status: 'ok' }),
    });
    const { result } = renderHook(() => useAnimeEditorRecord({ selectedAnimeId: 'anime-1', source }));
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    await act(async () => { await result.current.onRestore(); });

    expect(source.restoreAnime).toHaveBeenCalledWith('anime-1', 42);
    // Mandatory guard (design D11 corollary): success reloads the record.
    expect(source.getAnimeEditorRecord).toHaveBeenCalledTimes(2);
    expect(result.current.feedback).toBe('Anime restored.');
  });

  it('does not reload the record and reports the Restore-not-applied fallback when the backend sends no message', async () => {
    const source = createSource({
      getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', record: selectedRecord }),
      restoreAnime: vi.fn().mockResolvedValue({ status: 'error' }),
    });
    const { result } = renderHook(() => useAnimeEditorRecord({ selectedAnimeId: 'anime-1', source }));
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    await act(async () => { await result.current.onRestore(); });

    expect(source.restoreAnime).toHaveBeenCalledWith('anime-1', 42);
    expect(source.getAnimeEditorRecord).toHaveBeenCalledTimes(1);
    // Pins the renamed fallback literal (`use-anime-editor-record.ts`): easy to
    // miss because it is copy, not a button label.
    expect(result.current.feedback).toBe('Restore anime was not applied.');
  });
});

describe('editor record repeat handler', () => {
  /** Authority fixture: a finished anime with watched progress, before Repeat resets the cycle. */
  const selectedRecord = {
    animeId: 'anime-1',
    modifiedAt: 42,
    frequent: { name: 'Frieren', status: 1, progress: 28, totalEpisodes: 28, active: true, kind: 1, page: '', folder: '', placements: [] },
    details: { genres: [], studios: { kind: 'values' as const, values: [] } },
  };
  /** Authority fixture the post-repeat reload returns: a fresh cycle at zero progress. */
  const repeatedRecord = { ...selectedRecord, frequent: { ...selectedRecord.frequent, status: 0, progress: 0 } };

  it('calls repeatAnime, reloads the record on success, and proves the reload through zeroed watched episodes', async () => {
    const getAnimeEditorRecord = vi.fn()
      .mockResolvedValueOnce({ outcome: 'applied', record: selectedRecord })
      .mockResolvedValueOnce({ outcome: 'applied', record: repeatedRecord });
    const source = createSource({
      getAnimeEditorRecord,
      repeatAnime: vi.fn().mockResolvedValue({ status: 'ok' }),
    });
    const { result } = renderHook(() => useAnimeEditorRecord({ selectedAnimeId: 'anime-1', source }));
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    await act(async () => { await result.current.onRepeat(); });

    expect(source.repeatAnime).toHaveBeenCalledWith('anime-1', 42);
    // Mandatory guard (design D11): success reloads the record, proven by the
    // watched-episode count actually reading the reset value -- not just a spy call.
    expect(getAnimeEditorRecord).toHaveBeenCalledTimes(2);
    expect(result.current.draft.progress).toBe('0');
    expect(result.current.feedback).toBe('Anime repeated.');
  });

  it('does not reload the record and reports the Repeat-not-applied fallback on failure', async () => {
    const source = createSource({
      getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', record: selectedRecord }),
      repeatAnime: vi.fn().mockResolvedValue({ status: 'error' }),
    });
    const { result } = renderHook(() => useAnimeEditorRecord({ selectedAnimeId: 'anime-1', source }));
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    await act(async () => { await result.current.onRepeat(); });

    expect(source.repeatAnime).toHaveBeenCalledWith('anime-1', 42);
    expect(source.getAnimeEditorRecord).toHaveBeenCalledTimes(1);
    // Pins the Repeat feedback literal (`use-anime-editor-record.ts`): easy to
    // miss because it is copy, not a button label.
    expect(result.current.feedback).toBe('Repeat anime was not applied.');
  });
});

describe('editor record cover-image picker', () => {
  it('applies the picked image path and forces the on-disk cover source', async () => {
    const source = createSource({ pickFile: vi.fn().mockResolvedValue('D:/Anime/Show/cover.jpg') });
    const { result } = renderHook(() => useAnimeEditorRecord({ source }));

    await act(async () => { await result.current.onPickCoverFile(); });

    expect(source.pickFile).toHaveBeenCalledWith('Select cover image');
    expect(result.current.draft.coverPath).toBe('D:/Anime/Show/cover.jpg');
    expect(result.current.draft.coverType).toBe('image');
  });

  it('leaves the cover unchanged when the picker is cancelled', async () => {
    const source = createSource({ pickFile: vi.fn().mockResolvedValue('') });
    const { result } = renderHook(() => useAnimeEditorRecord({ source }));

    await act(async () => { await result.current.onPickCoverFile(); });

    expect(result.current.draft.coverPath).toBe('');
  });
});

describe('applied/undo state (D9)', () => {
  it('confirming a candidate patches the draft through the same channel and stores its pre-image', async () => {
    const source = createSource({ getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok', record: record() }) });
    const { result } = renderHook(() => useAnimeEditorRecord({ source, selectedAnimeId: 'anime-1' }));
    await waitFor(() => expect(result.current.draft.name).toBe('Bleach'));

    const selection: AnimeMetadataSelection = { name: 'Bleach: Sennen Kessen-hen', duration: '25', unfilled: ['kind', 'studios'] };
    act(() => result.current.onMetadataApplied(selection));

    expect(result.current.draft.name).toBe('Bleach: Sennen Kessen-hen');
    expect(result.current.draft.duration).toBe('25');
    expect(result.current.appliedMetadata?.patch).toEqual({ name: 'Bleach: Sennen Kessen-hen', duration: '25' });
    expect(result.current.appliedMetadata?.previous).toEqual({ name: 'Bleach', duration: '24' });
    expect(result.current.appliedMetadata?.unfilled).toEqual(['kind', 'studios']);
  });

  it('undo replays the pre-image through the same channel, reverting exactly the applied fields', async () => {
    const source = createSource({ getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok', record: record() }) });
    const { result } = renderHook(() => useAnimeEditorRecord({ source, selectedAnimeId: 'anime-1' }));
    await waitFor(() => expect(result.current.draft.name).toBe('Bleach'));

    act(() => result.current.onMetadataApplied({ name: 'Bleach: Sennen Kessen-hen', duration: '25', unfilled: [] }));
    act(() => result.current.onMetadataUndo());

    expect(result.current.draft.name).toBe('Bleach');
    expect(result.current.draft.duration).toBe('24');
    expect(result.current.appliedMetadata).toBeUndefined();
  });

  it('does nothing when undo is invoked with nothing applied', async () => {
    const source = createSource({ getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok', record: record() }) });
    const { result } = renderHook(() => useAnimeEditorRecord({ source, selectedAnimeId: 'anime-1' }));
    await waitFor(() => expect(result.current.draft.name).toBe('Bleach'));

    expect(() => act(() => result.current.onMetadataUndo())).not.toThrow();
    expect(result.current.draft.name).toBe('Bleach');
  });

  it('clears a pending Undo once a different record is loaded, so a stale pre-image is never replayed onto it', async () => {
    const source = createSource({
      getAnimeEditorRecord: vi.fn()
        .mockResolvedValueOnce({ outcome: 'applied', message: 'ok', record: record() })
        .mockResolvedValueOnce({ outcome: 'applied', message: 'ok', record: record({ animeId: 'anime-2', frequent: { ...record().frequent, name: 'Naruto' } }) }),
    });
    const { result, rerender } = renderHook(
      ({ selectedAnimeId }: { selectedAnimeId: string }) => useAnimeEditorRecord({ source, selectedAnimeId }),
      { initialProps: { selectedAnimeId: 'anime-1' } },
    );
    await waitFor(() => expect(result.current.draft.name).toBe('Bleach'));
    act(() => result.current.onMetadataApplied({ name: 'Bleach: Sennen Kessen-hen', unfilled: [] }));
    expect(result.current.appliedMetadata).toBeDefined();

    rerender({ selectedAnimeId: 'anime-2' });
    await waitFor(() => expect(result.current.draft.name).toBe('Naruto'));

    expect(result.current.appliedMetadata).toBeUndefined();
  });
});

describe('never-touched set -- non-negotiable #7, Editor half', () => {
  it('leaves Download page, Folder, Watched episodes, the watching estado, and premiere date unchanged after confirming a candidate', async () => {
    const source = createSource({ getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok', record: record() }) });
    const { result } = renderHook(() => useAnimeEditorRecord({ source, selectedAnimeId: 'anime-1' }));
    await waitFor(() => expect(result.current.draft.name).toBe('Bleach'));

    const selection: AnimeMetadataSelection = {
      name: 'Bleach: Sennen Kessen-hen',
      kind: '0',
      totalEpisodes: '25',
      duration: '24',
      origin: 'Manga',
      genres: 'Action',
      studios: 'Pierrot',
      coverURL: 'https://cdn.example/bleach.jpg',
      unfilled: [],
    };
    act(() => result.current.onMetadataApplied(selection));

    expect(result.current.draft.page).toBe('https://example.test/bleach');
    expect(result.current.draft.folder).toBe('D:/Anime/Bleach');
    expect(result.current.draft.progress).toBe('12');
    expect(result.current.draft.status).toBe(1);
    expect(result.current.draft.premieredAt).toBe('1000');
  });
});
