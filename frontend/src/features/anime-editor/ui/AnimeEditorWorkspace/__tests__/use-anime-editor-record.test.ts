import { act, renderHook } from '@testing-library/react';
import { waitFor } from './wait-for.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimeEditorSource } from '../../../../../shared/contracts/anime-editor-source.types';
import type { AnimeEditorRecord } from '../../../../../shared/contracts/anime.types';
import type { EpisodeCommandsSource } from '../../../../../shared/contracts/episodes.types';
import type { PickerSource } from '../../../../../shared/contracts/picker.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import type { AnimeMetadataSelection } from '../../../../../shared/metadata-lookup/metadata-lookup.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { flush, status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { ANIME_EDITOR_CALL_TIMEOUT_MESSAGE, ANIME_EDITOR_CALL_TIMEOUT_MS } from '../anime-editor-workspace.constants';
import { isIntentionalEditorOutcome } from '../anime-editor-workspace.helpers';
import { useAnimeEditorRecord } from '../use-anime-editor-record';

/** Toast stub, hoisted so the HeroUI module mock can close over it. */
const toastMock = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), danger: vi.fn() }));

vi.mock('@heroui/react', () => ({ toast: toastMock }));

/** Holds the current test's stub, which also serves the episodes module's restore and repeat. */
const episodesPort = vi.hoisted(() => ({ current: {} as unknown }));

vi.mock('../../../../../shared/query/bridge-runtime/bridge-runtime.constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  /** The lifecycle hook's restore and repeat port: the current test's stub. */
  get BRIDGE_EPISODES_SOURCE() {
    return episodesPort.current;
  },
}));

beforeEach(() => {
  Object.values(toastMock).forEach((mock) => mock.mockClear());
});

/** One fake serving the shell pickers, the anime module's Editor port and the episodes module's restore and repeat. */
type FakeEditorSources = PickerSource & AnimeEditorSource & Pick<EpisodeCommandsSource, 'restoreAnime' | 'repeatAnime'>;

/**
 * Builds a stubbed editor source for one hook test case: the runtime pickers,
 * the anime module's Editor port and the episodes module's restore and repeat
 * on one object, so a test asserts on any of them through the same stub.
 * @param overrides Bindings to replace on the default stub.
 * @returns The stubbed source.
 */
function createSource(overrides: Partial<FakeEditorSources>): FakeEditorSources {
  return {
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeEditorRecord: vi.fn(),
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    restoreAnime: vi.fn(),
    repeatAnime: vi.fn(),
    getAnimeEditorScheduleBoard: vi.fn(),
    applyAnimeEditorSchedule: vi.fn(),
    createAnime: vi.fn(),
    pickFolder: vi.fn().mockResolvedValue(''),
    pickFile: vi.fn().mockResolvedValue(''),
    ...overrides,
  } as unknown as FakeEditorSources;
}

/**
 * Renders the record hook over `source` inside a query client whose `anime`
 * module is in `anime`; `rerender({ selectedAnimeId })` switches the record.
 * @param source The stubbed sources.
 * @param selectedAnimeId The initially selected anime.
 * @param anime The anime module's readiness.
 * @returns The `renderHook` result.
 */
function renderRecord(source: FakeEditorSources, selectedAnimeId?: string, anime: ModuleReadiness = status('anime', 'ready')) {
  episodesPort.current = source;
  const { wrapper } = createModulesTestWrapper(anime);
  return renderHook(
    (props: { readonly selectedAnimeId?: string }) => useAnimeEditorRecord({ selectedAnimeId: props.selectedAnimeId, source, editorSource: source }),
    { initialProps: { selectedAnimeId }, wrapper },
  );
}

/**
 * Builds one editor record with every never-touched field (Download page,
 * Folder, Watched episodes, the watching estado) populated,
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

describe('editor record load failure', () => {
  it('clears the shown record and keeps a rejected record read on the surface instead of toasting it', async () => {
    const source = createSource({
      getAnimeEditorRecord: vi.fn()
        .mockResolvedValueOnce({ outcome: 'applied', message: 'ok', record: record() })
        .mockRejectedValueOnce(createBridgeError('internal', 'get anime editor record anime-2: database is locked')),
    });
    const { result, rerender } = renderRecord(source, 'anime-1');
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    rerender({ selectedAnimeId: 'anime-2' });

    await waitFor(() => expect(result.current.recordLoadError).toBe('get anime editor record anime-2: database is locked'));
    expect(result.current.selectedRecord).toBeUndefined();
    expect(result.current.isLoadingRecord).toBe(false);
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it('stays loading with no failure and no record read while the anime module starts', async () => {
    const source = createSource({ getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok', record: record() }) });
    const { result } = renderRecord(source, 'anime-1', status('anime', 'starting'));

    await act(flush);

    expect(result.current.isLoadingRecord).toBe(true);
    expect(result.current.recordLoadError).toBeUndefined();
    expect(result.current.selectedRecord).toBeUndefined();
    expect(source.getAnimeEditorRecord).not.toHaveBeenCalled();
  });
});

describe('editor record folder picker', () => {
  it('applies the picked folder path to the draft, leaves it unchanged on a cancel, and reports a failed dialog with the bridge reason leaving the draft unchanged', async () => {
    const source = createSource({
      pickFolder: vi.fn()
        .mockResolvedValueOnce('D:/Anime/New Show')
        .mockResolvedValueOnce('')
        .mockRejectedValueOnce(createBridgeError('internal', 'shell: the folder dialog failed')),
    });
    const { result } = renderRecord(source);

    await act(async () => { await result.current.onPickFolder(); });
    expect(source.pickFolder).toHaveBeenCalledWith('Select anime folder');
    expect(result.current.draft.folder).toBe('D:/Anime/New Show');

    // A cancelled picker leaves the folder unchanged and reports nothing.
    await act(async () => { await result.current.onPickFolder(); });
    expect(result.current.draft.folder).toBe('D:/Anime/New Show');
    expect(toastMock.danger).not.toHaveBeenCalled();

    // A failed dialog reports the bridge reason and leaves the draft unchanged.
    const draft = result.current.draft;
    await act(async () => { await result.current.onPickFolder(); });
    expect(result.current.draft).toBe(draft);
    expect(toastMock.danger).toHaveBeenCalledExactlyOnceWith('shell: the folder dialog failed');
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

  it('does not reload the record and reports the fallback or the failure message on a refused restore, then reloads the record on success and reports Restore feedback', async () => {
    const source = createSource({
      getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', record: selectedRecord }),
      restoreAnime: vi.fn()
        .mockRejectedValueOnce(createBridgeError('unavailable', ''))
        .mockRejectedValueOnce(createBridgeError('unavailable', 'episodes is starting'))
        .mockResolvedValueOnce({ status: 'ok' }),
    });
    const { result } = renderRecord(source, 'anime-1');
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    // Pins the renamed fallback literal (`use-anime-editor-record.ts`): easy to
    // miss because it is copy, not a button label.
    for (const toast of ['Restore anime was not applied.', 'episodes is starting']) {
      await act(async () => { await result.current.onRestore(); });
      expect(source.restoreAnime).toHaveBeenLastCalledWith('anime-1', 42);
      expect(source.getAnimeEditorRecord).toHaveBeenCalledTimes(1);
      expect(toastMock.danger).toHaveBeenLastCalledWith(toast);
    }

    await act(async () => { await result.current.onRestore(); });

    expect(source.restoreAnime).toHaveBeenLastCalledWith('anime-1', 42);
    // Mandatory guard (design D11 corollary): success reloads the record.
    expect(source.getAnimeEditorRecord).toHaveBeenCalledTimes(2);
    expect(toastMock.success).toHaveBeenCalledWith('Anime restored.');
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

  it('does not reload the record and reports the fallback or the failure message on a refused repeat, then reloads on success, proven through zeroed watched episodes', async () => {
    const getAnimeEditorRecord = vi.fn()
      .mockResolvedValueOnce({ outcome: 'applied', record: selectedRecord })
      .mockResolvedValueOnce({ outcome: 'applied', record: repeatedRecord });
    const source = createSource({
      getAnimeEditorRecord,
      repeatAnime: vi.fn()
        .mockRejectedValueOnce(createBridgeError('internal', ''))
        .mockRejectedValueOnce(createBridgeError('internal', 'anime write failed'))
        .mockResolvedValueOnce({ status: 'ok' }),
    });
    const { result } = renderRecord(source, 'anime-1');
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    // Pins the Repeat feedback literal (`use-anime-editor-record.ts`): easy to
    // miss because it is copy, not a button label.
    for (const toast of ['Repeat anime was not applied.', 'anime write failed']) {
      await act(async () => { await result.current.onRepeat(); });
      expect(source.repeatAnime).toHaveBeenLastCalledWith('anime-1', 42);
      expect(getAnimeEditorRecord).toHaveBeenCalledTimes(1);
      expect(toastMock.danger).toHaveBeenLastCalledWith(toast);
    }

    await act(async () => { await result.current.onRepeat(); });

    expect(source.repeatAnime).toHaveBeenLastCalledWith('anime-1', 42);
    // Mandatory guard (design D11): success reloads the record, proven by the
    // watched-episode count actually reading the reset value -- not just a spy call.
    expect(getAnimeEditorRecord).toHaveBeenCalledTimes(2);
    expect(result.current.draft.progress).toBe('0');
    expect(toastMock.success).toHaveBeenCalledWith('Anime repeated.');
  });
});

describe('editor record cover-image picker', () => {
  it('applies the picked image path forcing the on-disk cover source, leaves the cover unchanged on a cancel, and reports a failed dialog with the bridge reason', async () => {
    const source = createSource({
      pickFile: vi.fn()
        .mockResolvedValueOnce('D:/Anime/Show/cover.jpg')
        .mockResolvedValueOnce('')
        .mockRejectedValueOnce(createBridgeError('unavailable', 'the PickFile binding is not attached')),
    });
    const { result } = renderRecord(source);

    await act(async () => { await result.current.onPickCoverFile(); });
    expect(source.pickFile).toHaveBeenCalledWith('Select cover image');
    expect(result.current.draft.coverPath).toBe('D:/Anime/Show/cover.jpg');
    expect(result.current.draft.coverType).toBe('image');

    // A cancelled picker leaves the cover unchanged and reports nothing.
    await act(async () => { await result.current.onPickCoverFile(); });
    expect(result.current.draft.coverPath).toBe('D:/Anime/Show/cover.jpg');
    expect(toastMock.danger).not.toHaveBeenCalled();

    // A failed dialog reports the bridge reason and leaves the cover unchanged.
    const draft = result.current.draft;
    await act(async () => { await result.current.onPickCoverFile(); });
    expect(result.current.draft).toBe(draft);
    expect(toastMock.danger).toHaveBeenCalledExactlyOnceWith('the PickFile binding is not attached');
  });
});

describe('applied/undo state (D9)', () => {
  it('ignores an undo with nothing applied, patches the draft and stores its pre-image on a confirmed candidate, undo reverts exactly the applied fields, and a full candidate leaves the never-touched set unchanged (non-negotiable #7, Editor half)', async () => {
    const source = createSource({ getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok', record: record() }) });
    const { result } = renderRecord(source, 'anime-1');
    await waitFor(() => expect(result.current.draft.name).toBe('Bleach'));

    // Undo with nothing applied does nothing.
    expect(() => act(() => result.current.onMetadataUndo())).not.toThrow();
    expect(result.current.draft.name).toBe('Bleach');

    // Confirming a candidate patches the draft through the same channel and stores its pre-image.
    const selection: AnimeMetadataSelection = { name: 'Bleach: Sennen Kessen-hen', duration: '25', unfilled: ['kind', 'studios'] };
    act(() => result.current.onMetadataApplied(selection));

    expect(result.current.draft.name).toBe('Bleach: Sennen Kessen-hen');
    expect(result.current.draft.duration).toBe('25');
    expect(result.current.appliedMetadata?.patch).toEqual({ name: 'Bleach: Sennen Kessen-hen', duration: '25' });
    expect(result.current.appliedMetadata?.previous).toEqual({ name: 'Bleach', duration: '24' });
    expect(result.current.appliedMetadata?.unfilled).toEqual(['kind', 'studios']);

    // Undo replays the pre-image, reverting exactly the applied fields.
    act(() => result.current.onMetadataUndo());

    expect(result.current.draft.name).toBe('Bleach');
    expect(result.current.draft.duration).toBe('24');
    expect(result.current.appliedMetadata).toBeUndefined();

    // A candidate filling every field leaves Download page, Folder, Watched episodes, and the watching estado unchanged.
    act(() => result.current.onMetadataApplied({
      name: 'Bleach: Sennen Kessen-hen',
      kind: '0',
      totalEpisodes: '25',
      duration: '24',
      origin: 'Manga',
      genres: 'Action',
      studios: 'Pierrot',
      coverURL: 'https://cdn.example/bleach.jpg',
      unfilled: [],
    }));

    expect(result.current.draft.page).toBe('https://example.test/bleach');
    expect(result.current.draft.folder).toBe('D:/Anime/Bleach');
    expect(result.current.draft.progress).toBe('12');
    expect(result.current.draft.status).toBe(1);
  });

  it('clears a pending Undo once a different record is loaded, so a stale pre-image is never replayed onto it', async () => {
    const source = createSource({
      getAnimeEditorRecord: vi.fn()
        .mockResolvedValueOnce({ outcome: 'applied', message: 'ok', record: record() })
        .mockResolvedValueOnce({ outcome: 'applied', message: 'ok', record: record({ animeId: 'anime-2', frequent: { ...record().frequent, name: 'Naruto' } }) }),
    });
    const { result, rerender } = renderRecord(source, 'anime-1');
    await waitFor(() => expect(result.current.draft.name).toBe('Bleach'));
    act(() => result.current.onMetadataApplied({ name: 'Bleach: Sennen Kessen-hen', unfilled: [] }));
    expect(result.current.appliedMetadata).toBeDefined();

    rerender({ selectedAnimeId: 'anime-2' });
    await waitFor(() => expect(result.current.draft.name).toBe('Naruto'));

    expect(result.current.appliedMetadata).toBeUndefined();
  });
});

describe('editor record saves anime data only', () => {
  /** Authority fixture whose draft starts clean. */
  const selectedRecord = record();

  it('Discard changes restores the saved fields after a rejected save; a later save sends an anime-only command, clears dirty once applied, and exposes no episode draft', async () => {
    const saveAnimeEditor = vi.fn()
      .mockResolvedValueOnce({ outcome: 'conflict', message: 'stale', modifiedAt: 0 })
      .mockResolvedValueOnce({ outcome: 'applied', record: { ...selectedRecord, frequent: { ...selectedRecord.frequent, name: 'Bleach TYBW' } } });
    const source = createSource({ getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', record: selectedRecord }), saveAnimeEditor });
    const { result } = renderRecord(source, 'anime-1');
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));
    act(() => result.current.onDraftChange('name', 'Bleach TYBW'));
    await act(async () => { await result.current.onSave(); });
    expect(toastMock.warning).toHaveBeenCalledWith('stale');

    act(() => result.current.onDiscardChanges());

    expect(result.current.draft.name).toBe('Bleach');
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.onDraftChange('name', 'Bleach TYBW'));
    expect(result.current.isDirty).toBe(true);
    await act(async () => { await result.current.onSave(); });

    const [command] = saveAnimeEditor.mock.calls[1] as [Record<string, unknown>];
    expect(command).not.toHaveProperty('episodes');
    expect(command).toEqual(expect.objectContaining({ animeId: 'anime-1', patch: expect.objectContaining({ name: 'Bleach TYBW' }) }));
    expect(result.current.isDirty).toBe(false);
    expect(toastMock.success).toHaveBeenCalledWith('Changes saved.');
    expect(result.current.recordLoadError).toBeUndefined();
    expect(result.current).not.toHaveProperty('episodeEdits');
    expect(result.current).not.toHaveProperty('onEpisodeEditsChange');
  });

  it.each([
    ['save', 'saveAnimeEditor', (api: ReturnType<typeof useAnimeEditorRecord>) => api.onSave()],
    ['deactivate', 'deactivateAnime', (api: ReturnType<typeof useAnimeEditorRecord>) => api.onDeactivate()],
    ['restore', 'restoreAnime', (api: ReturnType<typeof useAnimeEditorRecord>) => api.onRestore()],
    ['repeat', 'repeatAnime', (api: ReturnType<typeof useAnimeEditorRecord>) => api.onRepeat()],
  ] as const)('a %s binding that never settles stops the busy state with an error outcome', async (_label, binding, run) => {
    const source = createSource({
      getAnimeEditorRecord: vi.fn().mockResolvedValue({ outcome: 'applied', record: selectedRecord }),
      [binding]: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const { result } = renderRecord(source, 'anime-1');
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));
    act(() => result.current.onDraftChange('name', 'Bleach TYBW'));
    vi.useFakeTimers();
    try {
      let outcome: unknown;
      let pending: Promise<unknown> = Promise.resolve();
      act(() => { pending = run(result.current).then((value) => { outcome = value; }); });
      expect(result.current.isSaving).toBe(true);

      await act(async () => { await vi.advanceTimersByTimeAsync(ANIME_EDITOR_CALL_TIMEOUT_MS); await pending; });

      expect(result.current.isSaving).toBe(false);
      expect(toastMock.danger).toHaveBeenCalledWith(ANIME_EDITOR_CALL_TIMEOUT_MESSAGE);
      expect(outcome).toEqual(expect.objectContaining({ message: ANIME_EDITOR_CALL_TIMEOUT_MESSAGE }));
      expect(result.current.draft.name).toBe('Bleach TYBW');
    } finally {
      vi.useRealTimers();
    }
  });
});
