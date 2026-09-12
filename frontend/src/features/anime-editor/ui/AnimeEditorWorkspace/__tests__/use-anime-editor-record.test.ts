import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
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
