import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoverPreviewSource } from '../../anime-cover.types';
import { COVER_PREVIEW_SETTLE_MS } from '../cover-preview.constants';
import { useCoverPreview } from '../use-cover-preview';

/** A preview answer carrying a rendered cover. */
const RENDERED = { source: 'cover', dataUrl: 'data:image/jpeg;base64,draft' };

/**
 * Builds a preview source whose binding answers with the given result.
 * @param answer What the binding resolves with.
 * @returns The source and its binding spy.
 */
function sourceAnswering(answer: Promise<{ source: string; dataUrl?: string }>) {
  const previewAnimeCover = vi.fn().mockReturnValue(answer);
  const source: CoverPreviewSource = { previewAnimeCover };
  return { source, previewAnimeCover };
}

describe('useCoverPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the placeholder and never asks the binding for an empty or sentinel value', () => {
    const { source, previewAnimeCover } = sourceAnswering(Promise.resolve(RENDERED));
    const { result, rerender } = renderHook(({ value }) => useCoverPreview(value, source), { initialProps: { value: '' } });

    rerender({ value: '   ' });
    rerender({ value: 'null' });
    act(() => vi.advanceTimersByTime(COVER_PREVIEW_SETTLE_MS));

    expect(result.current).toEqual({ status: 'placeholder' });
    expect(previewAnimeCover).not.toHaveBeenCalled();
  });

  it('loads while the typed value settles, then renders the cover the binding returns', async () => {
    const { source, previewAnimeCover } = sourceAnswering(Promise.resolve(RENDERED));
    const { result } = renderHook(() => useCoverPreview('  D:/Anime/cover.jpg ', source));

    expect(result.current).toEqual({ status: 'loading' });
    act(() => vi.advanceTimersByTime(COVER_PREVIEW_SETTLE_MS - 1));
    expect(previewAnimeCover).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(previewAnimeCover).toHaveBeenCalledExactlyOnceWith('D:/Anime/cover.jpg');
    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,draft' });
  });

  it('asks only for the value the user settled on while typing', async () => {
    const { source, previewAnimeCover } = sourceAnswering(Promise.resolve(RENDERED));
    const { rerender } = renderHook(({ value }) => useCoverPreview(value, source), { initialProps: { value: 'D:/a' } });

    act(() => vi.advanceTimersByTime(COVER_PREVIEW_SETTLE_MS / 2));
    rerender({ value: 'D:/a.jpg' });
    await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));

    expect(previewAnimeCover).toHaveBeenCalledExactlyOnceWith('D:/a.jpg');
  });

  it('never lets an earlier answer overwrite the cover of a newer value', async () => {
    let answerFirst: (value: { source: string; dataUrl?: string }) => void = () => undefined;
    const previewAnimeCover = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { answerFirst = resolve; }))
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:image/jpeg;base64,second' });
    const { result, rerender } = renderHook(({ value }) => useCoverPreview(value, { previewAnimeCover }), { initialProps: { value: 'D:/first.jpg' } });

    await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));
    rerender({ value: 'D:/second.jpg' });
    await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));
    await act(async () => answerFirst(RENDERED));

    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,second' });
  });

  it('never lets an earlier failure drop the cover of a newer value', async () => {
    let failFirst: (error: Error) => void = () => undefined;
    const previewAnimeCover = vi.fn()
      .mockReturnValueOnce(new Promise((_resolve, reject) => { failFirst = reject; }))
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:image/jpeg;base64,second' });
    const { result, rerender } = renderHook(({ value }) => useCoverPreview(value, { previewAnimeCover }), { initialProps: { value: 'D:/first.jpg' } });

    await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));
    rerender({ value: 'D:/second.jpg' });
    await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));
    await act(async () => failFirst(new Error('late')));

    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,second' });
  });

  it('degrades to the placeholder when the binding has no cover, fails, or is absent', async () => {
    const empty = sourceAnswering(Promise.resolve({ source: 'placeholder' }));
    const failed: CoverPreviewSource = { previewAnimeCover: vi.fn().mockRejectedValue(new Error('down')) };
    const absent = renderHook(() => useCoverPreview('D:/a.jpg', {}));
    const noCover = renderHook(() => useCoverPreview('D:/a.jpg', empty.source));
    const failure = renderHook(() => useCoverPreview('D:/a.jpg', failed));

    await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));

    expect(absent.result.current).toEqual({ status: 'placeholder' });
    expect(noCover.result.current).toEqual({ status: 'placeholder' });
    expect(failure.result.current).toEqual({ status: 'placeholder' });
  });
});
