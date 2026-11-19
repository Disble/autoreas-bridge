import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimeCoverPreviewSource, AnimeCoverResult } from '../../../contracts/anime-source.types';
import { createBridgeError } from '../../../query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../query/test-support/bridge-modules.test-support';
import { status } from '../../../query/test-support/readiness-source.test-support';
import { COVER_PREVIEW_SETTLE_MS } from '../cover-preview.constants';
import { useCoverPreview } from '../use-cover-preview';

/** A preview answer carrying a rendered cover. */
const RENDERED: AnimeCoverResult = { source: 'cover', dataUrl: 'data:image/jpeg;base64,draft' };

/**
 * Builds a preview source whose binding answers with the given result.
 * @param answer What the binding resolves with.
 * @returns The source and its binding spy.
 */
function sourceAnswering(answer: Promise<AnimeCoverResult>) {
  const previewAnimeCover = vi.fn().mockReturnValue(answer);
  const source: AnimeCoverPreviewSource = { previewAnimeCover };
  return { source, previewAnimeCover };
}

/**
 * A query client whose `anime` module is in `state`, so a test drives the
 * preview read through the same readiness gate the app uses.
 * @param state The anime module's readiness.
 * @param reason Why the module failed, for a `failed` state.
 * @returns The `renderHook` options carrying the wrapper.
 */
function animeModule(state: 'ready' | 'starting' | 'failed' = 'ready', reason?: string) {
  return { wrapper: createModulesTestWrapper(status('anime', state, reason)).wrapper };
}

/**
 * Lets `ms` of fake time pass, flushing the promises and query notifications it releases.
 * @param ms How much fake time passes.
 */
async function elapse(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

describe('useCoverPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the placeholder and never asks the binding for an empty or sentinel value', async () => {
    const { source, previewAnimeCover } = sourceAnswering(Promise.resolve(RENDERED));
    const { result, rerender } = renderHook(({ value }) => useCoverPreview(value, source), { initialProps: { value: '' }, ...animeModule() });

    rerender({ value: '   ' });
    rerender({ value: 'null' });
    await elapse(COVER_PREVIEW_SETTLE_MS);

    expect(result.current).toEqual({ status: 'placeholder' });
    expect(previewAnimeCover).not.toHaveBeenCalled();
  });


  it('loads while a value settles, renders its cover, then loads again and reads only the settled newer value', async () => {
    let answerSecond: (value: AnimeCoverResult) => void = () => undefined;
    const previewAnimeCover = vi.fn()
      .mockResolvedValueOnce(RENDERED)
      .mockReturnValueOnce(new Promise((resolve) => { answerSecond = resolve; }));
    const { result, rerender } = renderHook(({ value }) => useCoverPreview(value, { previewAnimeCover }), { initialProps: { value: '  D:/Anime/cover.jpg ' }, ...animeModule() });

    expect(result.current).toEqual({ status: 'loading' });
    await elapse(COVER_PREVIEW_SETTLE_MS - 1);
    expect(previewAnimeCover).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: 'loading' });
    await elapse(1);
    await elapse(0);

    expect(previewAnimeCover).toHaveBeenCalledExactlyOnceWith('D:/Anime/cover.jpg');
    expect(result.current).toEqual(toCover(RENDERED));

    rerender({ value: 'D:/a' });
    expect(result.current).toEqual({ status: 'loading' });
    await elapse(COVER_PREVIEW_SETTLE_MS / 2);
    rerender({ value: 'D:/a.jpg' });
    await elapse(COVER_PREVIEW_SETTLE_MS);
    await elapse(0);

    expect(previewAnimeCover).toHaveBeenCalledTimes(2);
    expect(previewAnimeCover).toHaveBeenLastCalledWith('D:/a.jpg');
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => answerSecond({ source: 'cover', dataUrl: 'data:image/jpeg;base64,second' }));
    await elapse(0);

    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,second' });
  });

  it('never lets an earlier answer or an earlier failure overwrite the cover of a newer value', async () => {
    let answerFirst: (value: AnimeCoverResult) => void = () => undefined;
    let failSecond: (error: Error) => void = () => undefined;
    const previewAnimeCover = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { answerFirst = resolve; }))
      .mockReturnValueOnce(new Promise((_resolve, reject) => { failSecond = reject; }))
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:image/jpeg;base64,third' });
    const { result, rerender } = renderHook(({ value }) => useCoverPreview(value, { previewAnimeCover }), { initialProps: { value: 'D:/first.jpg' }, ...animeModule() });

    await elapse(COVER_PREVIEW_SETTLE_MS);
    rerender({ value: 'D:/second.jpg' });
    await elapse(COVER_PREVIEW_SETTLE_MS);
    rerender({ value: 'D:/third.jpg' });
    await elapse(COVER_PREVIEW_SETTLE_MS);
    await elapse(0);

    expect(previewAnimeCover).toHaveBeenCalledTimes(3);
    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,third' });

    await act(async () => answerFirst(RENDERED));
    await elapse(0);

    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,third' });

    await act(async () => failSecond(createBridgeError('internal', 'late')));
    await elapse(0);

    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,third' });
  });

  it('shows the placeholder for a no-cover answer, then a failed read with its reason instead', async () => {
    const previewAnimeCover = vi.fn()
      .mockResolvedValueOnce({ source: 'placeholder' })
      .mockRejectedValueOnce(createBridgeError('internal', 'anime: cover thumbnail service crashed'));
    const { result, rerender } = renderHook(({ value }) => useCoverPreview(value, { previewAnimeCover }), { initialProps: { value: 'D:/a.jpg' }, ...animeModule() });

    await elapse(COVER_PREVIEW_SETTLE_MS);
    await elapse(0);

    expect(result.current).toEqual({ status: 'placeholder' });

    rerender({ value: 'D:/b.jpg' });
    await elapse(COVER_PREVIEW_SETTLE_MS);
    await elapse(0);

    expect(result.current).toEqual({ status: 'failure', message: 'anime: cover thumbnail service crashed' });
  });

  it('keeps loading without calling the binding while the anime module starts', async () => {
    const { source, previewAnimeCover } = sourceAnswering(Promise.resolve(RENDERED));
    const { result } = renderHook(() => useCoverPreview('D:/a.jpg', source), animeModule('starting'));

    await elapse(COVER_PREVIEW_SETTLE_MS);
    await elapse(0);

    expect(result.current).toEqual({ status: 'loading' });
    expect(previewAnimeCover).not.toHaveBeenCalled();
  });

  it('reports the module failure, without calling the binding, once the anime module failed', async () => {
    const { source, previewAnimeCover } = sourceAnswering(Promise.resolve(RENDERED));
    const { result } = renderHook(() => useCoverPreview('D:/a.jpg', source), animeModule('failed', 'bridge database failed to open'));

    await elapse(COVER_PREVIEW_SETTLE_MS);
    await elapse(0);

    expect(result.current).toMatchObject({ status: 'failure' });
    expect(result.current).toHaveProperty('message', expect.stringContaining('bridge database failed to open'));
    expect(previewAnimeCover).not.toHaveBeenCalled();
  });
});

/**
 * The entry a rendered answer resolves to.
 * @param result The binding's rendered answer.
 * @returns The cover entry.
 */
function toCover(result: AnimeCoverResult) {
  return { status: 'cover', dataUrl: result.dataUrl };
}
