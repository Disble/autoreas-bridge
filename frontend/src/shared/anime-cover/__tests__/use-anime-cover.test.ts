import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createModulesTestWrapper } from '../../query/test-support/bridge-modules.test-support';
import type { AnimeCoverSource } from '../anime-cover.types';
import { useAnimeCover } from '../use-anime-cover';

/**
 * Minimal cover port fixture: `getAnimeCover` overridable so a case can omit
 * it entirely to exercise the degrade path.
 */
function createSource(overrides: AnimeCoverSource = {}): AnimeCoverSource {
  return { ...overrides };
}

/** A query wrapper whose `anime` module is ready. */
function readyAnime() {
  return createModulesTestWrapper({ module: 'anime', state: 'ready' });
}

describe('useAnimeCover', () => {
  it('never calls getAnimeCover and returns the placeholder immediately when hasStoredCover is false', () => {
    const getAnimeCover = vi.fn();
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', false, source), readyAnime());

    expect(result.current).toEqual({ status: 'placeholder' });
    expect(getAnimeCover).not.toHaveBeenCalled();
  });

  it('calls getAnimeCover and reports loading while the request is pending', async () => {
    const getAnimeCover = vi.fn().mockReturnValue(new Promise(() => {}));
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source), readyAnime());

    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(getAnimeCover).toHaveBeenCalledWith('anime-1'));
    expect(result.current).toEqual({ status: 'loading' });
  });

  it('stays loading without calling the binding while the anime module is starting', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:a' });
    const { wrapper, emit } = createModulesTestWrapper({ module: 'anime', state: 'starting' });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, createSource({ getAnimeCover })), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toEqual({ status: 'loading' });
    expect(getAnimeCover).not.toHaveBeenCalled();

    act(() => emit({ module: 'anime', state: 'ready' }));
    await waitFor(() => expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:a' }));
  });

  it('resolves to the cover entry when the binding reports source: cover', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/png;base64,abc' });
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source), readyAnime());

    await waitFor(() => expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/png;base64,abc' }));
  });

  it('resolves to the placeholder when the binding reports source: placeholder', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source), readyAnime());

    await waitFor(() => expect(result.current).toEqual({ status: 'placeholder' }));
  });

  it('resolves to the placeholder when a cover-source response is missing its dataUrl', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover' });
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source), readyAnime());

    await waitFor(() => expect(result.current).toEqual({ status: 'placeholder' }));
  });

  it('resolves to the placeholder for a non-cover source even when dataUrl is present', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'unknown', dataUrl: 'data:image/png;base64,abc' });
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source), readyAnime());

    await waitFor(() => expect(result.current).toEqual({ status: 'placeholder' }));
  });

  it('resolves to the placeholder when the binding rejects', async () => {
    const getAnimeCover = vi.fn().mockRejectedValue(new Error('boom'));
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source), readyAnime());

    await waitFor(() => expect(result.current).toEqual({ status: 'placeholder' }));
  });

  it('resolves to the placeholder when the binding throws synchronously', async () => {
    const getAnimeCover = vi.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source), readyAnime());

    await waitFor(() => expect(result.current).toEqual({ status: 'placeholder' }));
  });

  it('degrades to the placeholder without ever fetching when getAnimeCover is absent from the source', () => {
    const source = createSource({ getAnimeCover: undefined });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source), readyAnime());

    expect(result.current).toEqual({ status: 'placeholder' });
  });

  it('never paints a stale resolved response for a superseded animeId', async () => {
    let resolveFirst: (cover: { readonly source: string; readonly dataUrl?: string }) => void = () => {};
    const first = new Promise<{ readonly source: string; readonly dataUrl?: string }>((resolve) => {
      resolveFirst = resolve;
    });
    const getAnimeCover = vi.fn((animeId: string) => (animeId === 'anime-1' ? first : Promise.resolve({ source: 'cover', dataUrl: 'data:second' })));
    const source = createSource({ getAnimeCover });

    const { rerender, result } = renderHook(
      ({ animeId }: { animeId: string }) => useAnimeCover(animeId, true, source),
      { initialProps: { animeId: 'anime-1' }, ...readyAnime() },
    );

    rerender({ animeId: 'anime-2' });
    await waitFor(() => expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:second' }));

    await act(async () => {
      resolveFirst({ source: 'cover', dataUrl: 'data:first' });
      await first;
    });

    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:second' });
  });

  it('never paints a stale rejected response for a superseded animeId', async () => {
    let rejectFirst: (error: Error) => void = () => {};
    const first = new Promise<{ readonly source: string; readonly dataUrl?: string }>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const getAnimeCover = vi.fn((animeId: string) => (animeId === 'anime-1' ? first : Promise.resolve({ source: 'cover', dataUrl: 'data:second' })));
    const source = createSource({ getAnimeCover });

    const { rerender, result } = renderHook(
      ({ animeId }: { animeId: string }) => useAnimeCover(animeId, true, source),
      { initialProps: { animeId: 'anime-1' }, ...readyAnime() },
    );

    rerender({ animeId: 'anime-2' });
    await waitFor(() => expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:second' }));

    await act(async () => {
      rejectFirst(new Error('stale boom'));
      await first.catch(() => undefined);
    });

    expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:second' });
  });
});
