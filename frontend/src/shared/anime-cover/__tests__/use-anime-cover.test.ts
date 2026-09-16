import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { useAnimeCover } from '../use-anime-cover';

/**
 * Minimal `BridgeRuntimeSource` fixture (mirrors `use-anime-detail.test.tsx`'s
 * own `createSource`): every required member stubbed, `getAnimeCover`
 * overridable so a case can omit it entirely to exercise the degrade path.
 */
function createSource(overrides: Partial<BridgeRuntimeSource> = {}): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: vi.fn(),
    getAnimeDetail: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useAnimeCover', () => {
  it('never calls getAnimeCover and returns the placeholder immediately when hasStoredCover is false', () => {
    const getAnimeCover = vi.fn();
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', false, source));

    expect(result.current).toEqual({ status: 'placeholder' });
    expect(getAnimeCover).not.toHaveBeenCalled();
  });

  it('calls getAnimeCover and reports loading while the request is pending', () => {
    const getAnimeCover = vi.fn().mockReturnValue(new Promise(() => {}));
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source));

    expect(result.current).toEqual({ status: 'loading' });
    expect(getAnimeCover).toHaveBeenCalledWith('anime-1');
  });

  it('resolves to the cover entry when the binding reports source: cover', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/png;base64,abc' });
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source));

    await waitFor(() => expect(result.current).toEqual({ status: 'cover', dataUrl: 'data:image/png;base64,abc' }));
  });

  it('resolves to the placeholder when the binding reports source: placeholder', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source));

    await waitFor(() => expect(result.current).toEqual({ status: 'placeholder' }));
  });

  it('resolves to the placeholder when a cover-source response is missing its dataUrl', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover' });
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source));

    await waitFor(() => expect(result.current).toEqual({ status: 'placeholder' }));
  });

  it('resolves to the placeholder for a non-cover source even when dataUrl is present', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'unknown', dataUrl: 'data:image/png;base64,abc' });
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source));

    await waitFor(() => expect(result.current).toEqual({ status: 'placeholder' }));
  });

  it('resolves to the placeholder when the binding rejects', async () => {
    const getAnimeCover = vi.fn().mockRejectedValue(new Error('boom'));
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source));

    await waitFor(() => expect(result.current).toEqual({ status: 'placeholder' }));
  });

  it('resolves to the placeholder when the binding throws synchronously', async () => {
    const getAnimeCover = vi.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    const source = createSource({ getAnimeCover });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source));

    await waitFor(() => expect(result.current).toEqual({ status: 'placeholder' }));
  });

  it('degrades to the placeholder without ever fetching when getAnimeCover is absent from the source', () => {
    const source = createSource({ getAnimeCover: undefined });

    const { result } = renderHook(() => useAnimeCover('anime-1', true, source));

    expect(result.current).toEqual({ status: 'placeholder' });
  });

  it('never paints a stale resolved response for a superseded animeId', async () => {
    let resolveFirst: (cover: { readonly source: string; readonly dataUrl?: string }) => void = () => {};
    const first = new Promise<{ readonly source: string; readonly dataUrl?: string }>((resolve) => {
      resolveFirst = resolve;
    });
    const getAnimeCover = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:second' });
    const source = createSource({ getAnimeCover });

    const { rerender, result } = renderHook(
      ({ animeId }: { animeId: string }) => useAnimeCover(animeId, true, source),
      { initialProps: { animeId: 'anime-1' } },
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
    const getAnimeCover = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:second' });
    const source = createSource({ getAnimeCover });

    const { rerender, result } = renderHook(
      ({ animeId }: { animeId: string }) => useAnimeCover(animeId, true, source),
      { initialProps: { animeId: 'anime-1' } },
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
