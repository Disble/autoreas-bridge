import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EpisodeDurationRuntimeSource, EpisodeDurationSaveResult } from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeDurationEdit } from '../../../../../shared/contracts/anime.types';
import { EPISODE_DURATIONS_SAVE_FAILED_MESSAGE } from '../episode-durations-section.constants';
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
  const rendered = renderHook((props: { readonly animeId?: string }) => useEpisodeDurationsDraft({ animeId: props.animeId, source }), { initialProps: { animeId: animeId ?? undefined } });
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
    await act(async () => { settle({ outcome: 'applied', changed: 1 }); await pending; });
    expect(result.current.isSaving).toBe(false);
  });

  it('saves nothing without edits or without an anime', async () => {
    const save = vi.fn();
    const empty = renderHook(() => useEpisodeDurationsDraft({ animeId: 'anime-1', source: createSource(save) }));
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
    await act(async () => { settle({ outcome: 'applied', changed: 1 }); await pending; });

    expect(result.current.edits).toEqual(EDITS);
    expect(result.current.revision).toBe(0);
  });
});
