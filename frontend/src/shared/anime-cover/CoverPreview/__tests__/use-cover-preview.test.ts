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

  it('loads while the typed value settles, then renders the cover the binding returns', async () => {
    const { source, previewAnimeCover } = sourceAnswering(Promise.resolve(RENDERED));
    const { result } = renderHook(() => useCoverPreview('  D:/Anime/cover.jpg ', source), animeModule());

    expect(result.current).toEqual({ status: 'loading' });
    await elapse(COVER_PREVIEW_SETTLE_MS - 1);
    expect(previewAnimeCover).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: 'loading' });
    await elapse(1);
    await elapse(0);

    expect(previewAnimeCover).toHaveBeenCalledExactlyOnceWith('D:/Anime/cover.jpg');
    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,draft' });
  });

  it('asks only for the value the user settled on while typing', async () => {
    const { source, previewAnimeCover } = sourceAnswering(Promise.resolve(RENDERED));
    const { rerender } = renderHook(({ value }) => useCoverPreview(value, source), { initialProps: { value: 'D:/a' }, ...animeModule() });

    await elapse(COVER_PREVIEW_SETTLE_MS / 2);
    rerender({ value: 'D:/a.jpg' });
    await elapse(COVER_PREVIEW_SETTLE_MS);
    await elapse(0);

    expect(previewAnimeCover).toHaveBeenCalledExactlyOnceWith('D:/a.jpg');
  });

  it('loads instead of showing the previous cover while a newer value settles and reads', async () => {
    let answerSecond: (value: AnimeCoverResult) => void = () => undefined;
    const previewAnimeCover = vi.fn()
      .mockResolvedValueOnce(RENDERED)
      .mockReturnValueOnce(new Promise((resolve) => { answerSecond = resolve; }));
    const { result, rerender } = renderHook(({ value }) => useCoverPreview(value, { previewAnimeCover }), { initialProps: { value: 'D:/first.jpg' }, ...animeModule() });
    await elapse(COVER_PREVIEW_SETTLE_MS);
    await elapse(0);
    expect(result.current).toEqual(toCover(RENDERED));

    rerender({ value: 'D:/second.jpg' });
    expect(result.current).toEqual({ status: 'loading' });
    await elapse(COVER_PREVIEW_SETTLE_MS);
    await elapse(0);
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => answerSecond({ source: 'cover', dataUrl: 'data:image/jpeg;base64,second' }));
    await elapse(0);

    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,second' });
  });

  it('never lets an earlier answer overwrite the cover of a newer value', async () => {
    let answerFirst: (value: AnimeCoverResult) => void = () => undefined;
    const previewAnimeCover = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { answerFirst = resolve; }))
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:image/jpeg;base64,second' });
    const { result, rerender } = renderHook(({ value }) => useCoverPreview(value, { previewAnimeCover }), { initialProps: { value: 'D:/first.jpg' }, ...animeModule() });

    await elapse(COVER_PREVIEW_SETTLE_MS);
    rerender({ value: 'D:/second.jpg' });
    await elapse(COVER_PREVIEW_SETTLE_MS);
    await act(async () => answerFirst(RENDERED));
    await elapse(0);

    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,second' });
  });

  it('never lets an earlier failure drop the cover of a newer value', async () => {
    let failFirst: (error: Error) => void = () => undefined;
    const previewAnimeCover = vi.fn()
      .mockReturnValueOnce(new Promise((_resolve, reject) => { failFirst = reject; }))
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:image/jpeg;base64,second' });
    const { result, rerender } = renderHook(({ value }) => useCoverPreview(value, { previewAnimeCover }), { initialProps: { value: 'D:/first.jpg' }, ...animeModule() });

    await elapse(COVER_PREVIEW_SETTLE_MS);
    rerender({ value: 'D:/second.jpg' });
    await elapse(COVER_PREVIEW_SETTLE_MS);
    await act(async () => failFirst(createBridgeError('internal', 'late')));
    await elapse(0);

    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,second' });
  });

  it('shows the placeholder when the binding answers that the value renders no cover', async () => {
    const { source } = sourceAnswering(Promise.resolve({ source: 'placeholder' }));
    const { result } = renderHook(() => useCoverPreview('D:/a.jpg', source), animeModule());

    await elapse(COVER_PREVIEW_SETTLE_MS);
    await elapse(0);

    expect(result.current).toEqual({ status: 'placeholder' });
  });

  it('reports a failed read with its reason instead of the no-cover placeholder', async () => {
    const previewAnimeCover = vi.fn().mockRejectedValue(createBridgeError('internal', 'anime: cover thumbnail service crashed'));
    const { result } = renderHook(() => useCoverPreview('D:/a.jpg', { previewAnimeCover }), animeModule());

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
