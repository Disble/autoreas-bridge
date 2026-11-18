import { act, renderHook } from '@testing-library/react';
import { waitFor } from '../../AnimeEditorWorkspace/__tests__/wait-for.test-support';
import { describe, expect, it, vi } from 'vitest';
import type { EpisodeDurationRuntimeSource, EpisodeDurationSaveResult, EpisodeDurationSection } from '../../../../../shared/contracts/episode-durations.types';
import type { EpisodeDurationEdit } from '../../../../../shared/contracts/anime.types';
import { createBridgeQueryTestWrapper } from '../../../../../shared/query/test-support/bridge-query.test-support';
import { EPISODE_DURATIONS_SAVE_FAILED_MESSAGE } from '../episode-durations-section.constants';
import { toEpisodeDurationRowViews } from '../episode-durations-section.helpers';
import { useEpisodeDurationForms } from '../use-episode-duration-forms';
import { useEpisodeDurationsDraft } from '../use-episode-durations-draft';

/** One unsaved hand value for episode 4. */
const EDITS: readonly EpisodeDurationEdit[] = [{ episode: 4, durationMs: 2_760_000, source: 'manual', clear: false }];

/**
 * Builds a fake source whose save answers with `save`.
 * @param save The save binding.
 * @returns The source.
 */
function createSource(save: EpisodeDurationRuntimeSource['saveEpisodeDurations']): EpisodeDurationRuntimeSource {
  return {
    getEpisodeDurationSection: vi.fn(),
    reanalyzeEpisodeDurations: vi.fn(),
    cancelEpisodeReanalysis: vi.fn(),
    saveEpisodeDurations: save,
    onEpisodeReanalysisProgress: vi.fn(() => () => undefined),
  };
}

/**
 * Renders the draft hook for one anime with the given edits already applied.
 * @param source The fake source.
 * @param animeId The saved anime, or `null` for none.
 * @returns The render result.
 */
function renderDraft(source: EpisodeDurationRuntimeSource, animeId: string | null = 'anime-1') {
  const rendered = renderHook((props: { readonly animeId?: string }) => useEpisodeDurationsDraft({ animeId: props.animeId, source }), { initialProps: { animeId: animeId ?? undefined }, wrapper: createBridgeQueryTestWrapper().wrapper });
  act(() => rendered.result.current.onEditsChange(EDITS));
  return rendered;
}

describe('useEpisodeDurationsDraft', () => {
  it.each(['applied', 'no_op'] as const)('saves the card edits on their own and clears the draft after %s', async (outcome) => {
    const save = vi.fn().mockResolvedValue({ outcome, changed: 1 } satisfies EpisodeDurationSaveResult);
    const { result } = renderDraft(createSource(save));
    expect(result.current.isDirty).toBe(true);

    let answer: EpisodeDurationSaveResult | undefined;
    await act(async () => { answer = await result.current.onSave(); });

    expect(save).toHaveBeenCalledWith('anime-1', EDITS);
    expect(answer?.outcome).toBe(outcome);
    expect(result.current.edits).toEqual([]);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.revision).toBe(1);
    expect(result.current.saveError).toBeUndefined();
    expect(result.current.isSaving).toBe(false);
  });

  it('keeps the draft and shows the message when the save fails', async () => {
    const save = vi.fn().mockResolvedValue({ outcome: 'error', message: 'disk full', changed: 0 });
    const { result } = renderDraft(createSource(save));

    await act(async () => { await result.current.onSave(); });

    expect(result.current.edits).toEqual(EDITS);
    expect(result.current.revision).toBe(0);
    expect(result.current.saveError).toBe('disk full');
    expect(result.current.isSaving).toBe(false);
  });

  it('keeps the draft with a generic message when the failure has none, and with the thrown message when the binding throws', async () => {
    const save = vi.fn()
      .mockResolvedValueOnce({ outcome: 'error', changed: 0 })
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderDraft(createSource(save));

    await act(async () => { await result.current.onSave(); });
    expect(result.current.saveError).toBe(EPISODE_DURATIONS_SAVE_FAILED_MESSAGE);

    let answer: EpisodeDurationSaveResult | undefined;
    await act(async () => { answer = await result.current.onSave(); });
    expect(answer).toEqual({ outcome: 'error', message: 'offline', changed: 0 });
    expect(result.current.saveError).toBe('offline');
    expect(result.current.edits).toEqual(EDITS);
  });

  it('marks the draft as saving while the save is in flight and clears an old error', async () => {
    let settle: (result: EpisodeDurationSaveResult) => void = () => undefined;
    const save = vi.fn()
      .mockResolvedValueOnce({ outcome: 'error', message: 'disk full', changed: 0 })
      .mockImplementationOnce(() => new Promise<EpisodeDurationSaveResult>((resolve) => { settle = resolve; }));
    const { result } = renderDraft(createSource(save));
    await act(async () => { await result.current.onSave(); });

    let pending: Promise<unknown> = Promise.resolve();
    act(() => { pending = result.current.onSave(); });
    expect(result.current.isSaving).toBe(true);
    expect(result.current.saveError).toBeUndefined();
    // A bridge mutation calls its command a few microtasks after it starts.
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await act(async () => { settle({ outcome: 'applied', changed: 1 }); await pending; });
    expect(result.current.isSaving).toBe(false);
  });

  it('saves nothing without edits or without an anime', async () => {
    const save = vi.fn();
    const empty = renderHook(() => useEpisodeDurationsDraft({ animeId: 'anime-1', source: createSource(save) }), { wrapper: createBridgeQueryTestWrapper().wrapper });
    const noAnime = renderDraft(createSource(save), null);

    let first: unknown = 'unset';
    let second: unknown = 'unset';
    await act(async () => { first = await empty.result.current.onSave(); });
    await act(async () => { second = await noAnime.result.current.onSave(); });

    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
  });

  it('discards the edits and the error, and starts empty for another anime', async () => {
    const save = vi.fn().mockResolvedValue({ outcome: 'error', message: 'disk full', changed: 0 });
    const { result, rerender } = renderDraft(createSource(save));
    await act(async () => { await result.current.onSave(); });

    act(() => result.current.onDiscard());
    expect(result.current.edits).toEqual([]);
    expect(result.current.saveError).toBeUndefined();

    act(() => result.current.onEditsChange(EDITS));
    rerender({ animeId: 'anime-2' });
    expect(result.current.edits).toEqual([]);
    expect(result.current.isDirty).toBe(false);
  });

  it('drops the answer of a save that settles after the Editor moved to another anime', async () => {
    let settle: (result: EpisodeDurationSaveResult) => void = () => undefined;
    const save = vi.fn(() => new Promise<EpisodeDurationSaveResult>((resolve) => { settle = resolve; }));
    const { result, rerender } = renderDraft(createSource(save));

    let pending: Promise<unknown> = Promise.resolve();
    act(() => { pending = result.current.onSave(); });
    rerender({ animeId: 'anime-2' });
    act(() => result.current.onEditsChange(EDITS));
    // A bridge mutation calls its command a few microtasks after it starts.
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await act(async () => { settle({ outcome: 'applied', changed: 1 }); await pending; });

    expect(result.current.edits).toEqual(EDITS);
    expect(result.current.revision).toBe(0);
  });
});

/** Episodes 4 (23 min, measured) and 5 (24 min, measured) of a found TV folder. */
const SECTION: EpisodeDurationSection = {
  folderStatus: 'found', beyondTotal: [], tv: true,
  rows: [
    { episode: 4, durationMs: 23 * 60_000, minutes: 23, long: false, source: 'measured' },
    { episode: 5, durationMs: 24 * 60_000, minutes: 24, long: false, source: 'measured' },
  ],
};

/** The rendered rows of {@link SECTION} with no unsaved edit. */
const ROWS = toEpisodeDurationRowViews(SECTION, []);

/**
 * Renders the forms hook over the section's rows.
 * @param edits The draft's unsaved edits.
 * @returns The hook result and its edits spy.
 */
function renderForms(edits: readonly EpisodeDurationEdit[] = []) {
  const onEditsChange = vi.fn();
  const hook = renderHook(() => useEpisodeDurationForms({ rows: ROWS, edits, onEditsChange, isTV: true }));
  return { ...hook, onEditsChange };
}

describe('useEpisodeDurationForms edit modal', () => {
  it('opens prefilled with the current minutes and applies a manual value', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenEdit(4));
    expect(result.current.editForm).toEqual({ episode: 4, minutes: '23' });
    expect(result.current.editView).toEqual({ title: 'Episode 04 duration', minutes: '23', sourceLine: 'Measured from the file', canApply: true, canClear: true });
    act(() => result.current.onEditMinutesChange('46'));
    act(() => result.current.onApplyEdit());

    expect(onEditsChange).toHaveBeenCalledWith([{ episode: 4, durationMs: 46 * 60_000, source: 'manual', clear: false }]);
    expect(result.current.editForm).toBeUndefined();
  });

  it('clears a stored duration with a clear edit', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenEdit(5));
    act(() => result.current.onClearEdit());

    expect(onEditsChange).toHaveBeenCalledWith([{ episode: 5, durationMs: 0, source: 'manual', clear: true }]);
    expect(result.current.editForm).toBeUndefined();
  });

  it('refuses minutes that are not a whole number above zero, and cancels without a change', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenEdit(4));
    act(() => result.current.onEditMinutesChange('0'));
    act(() => result.current.onApplyEdit());
    expect(onEditsChange).not.toHaveBeenCalled();
    expect(result.current.editView?.canApply).toBe(false);
    act(() => result.current.onCloseEdit());

    expect(result.current.editForm).toBeUndefined();
    expect(onEditsChange).not.toHaveBeenCalled();
  });
});

describe('useEpisodeDurationForms add modal', () => {
  it('prefills the next episode and adds a manual value', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenAdd());
    expect(result.current.addForm).toEqual({ episode: '6', minutes: '' });
    act(() => result.current.onAddMinutesChange('62'));
    expect(result.current.addView).toEqual(expect.objectContaining({ isLongHintVisible: true, canAdd: true }));
    act(() => result.current.onApplyAdd());

    expect(onEditsChange).toHaveBeenCalledWith([{ episode: 6, durationMs: 62 * 60_000, source: 'manual', clear: false }]);
    expect(result.current.addForm).toBeUndefined();
  });

  it('blocks a number that already has a duration and switches to editing it', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenAdd());
    act(() => result.current.onAddEpisodeChange('5'));
    act(() => result.current.onAddMinutesChange('45'));
    act(() => result.current.onApplyAdd());
    expect(onEditsChange).not.toHaveBeenCalled();
    expect(result.current.addView?.duplicateMessage).toBe('Episode 5 already has 24 min.');
    act(() => result.current.onEditInstead());

    expect(result.current.addForm).toBeUndefined();
    expect(result.current.editForm).toEqual({ episode: 5, minutes: '24' });
  });

  it('closes the add modal without a change', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenAdd());
    act(() => result.current.onCloseAdd());

    expect(result.current.addForm).toBeUndefined();
    expect(onEditsChange).not.toHaveBeenCalled();
  });
});

describe('useEpisodeDurationForms with nothing open', () => {
  it('ignores typing, Apply, Clear, Add and Edit instead while no modal is open', () => {
    const { result, onEditsChange } = renderForms();

    act(() => {
      result.current.onEditMinutesChange('30');
      result.current.onAddEpisodeChange('9');
      result.current.onAddMinutesChange('30');
    });
    act(() => {
      result.current.onApplyEdit();
      result.current.onClearEdit();
      result.current.onApplyAdd();
      result.current.onEditInstead();
    });

    expect(result.current.editForm).toBeUndefined();
    expect(result.current.editView).toBeUndefined();
    expect(result.current.addForm).toBeUndefined();
    expect(result.current.addView).toBeUndefined();
    expect(onEditsChange).not.toHaveBeenCalled();
  });

  it('opens Edit and Add from the rows the table lists now', () => {
    const onEditsChange = vi.fn();
    const later = toEpisodeDurationRowViews({ ...SECTION, rows: [...SECTION.rows, { episode: 9, durationMs: 30 * 60_000, minutes: 30, long: false, source: 'manual' }] }, []);
    const { result, rerender } = renderHook((rows: typeof ROWS) => useEpisodeDurationForms({ rows, edits: [], onEditsChange, isTV: true }), { initialProps: ROWS });

    rerender(later);
    act(() => result.current.onOpenEdit(9));
    act(() => result.current.onOpenAdd());

    expect(result.current.editForm).toEqual({ episode: 9, minutes: '30' });
    expect(result.current.addForm).toEqual({ episode: '10', minutes: '' });
  });
});
