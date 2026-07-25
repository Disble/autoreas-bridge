import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COPY_CONFIRMATION_MS } from '../code-block.constants';
import { useCodeBlock } from '../use-code-block';

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

describe('useCodeBlock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('copies the raw string while the pretty view is active, not the indented text', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeTextMock);
    const raw = '{"a":1,"b":2}';

    const { result } = renderHook(() => useCodeBlock(raw));

    expect(result.current.view).toBe('pretty');

    await act(async () => {
      await result.current.onCopy();
    });

    expect(writeTextMock).toHaveBeenCalledWith(raw);
    expect(writeTextMock).not.toHaveBeenCalledWith(JSON.stringify(JSON.parse(raw), null, 2));
  });

  it('copies the raw string while the raw view is active', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeTextMock);
    const raw = '{"a":1}';

    const { result } = renderHook(() => useCodeBlock(raw));

    act(() => {
      result.current.onViewChange('raw');
    });

    await act(async () => {
      await result.current.onCopy();
    });

    expect(writeTextMock).toHaveBeenCalledWith(raw);
  });

  it('copies non-JSON text as-is', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeTextMock);
    const raw = 'Internal Server Error';

    const { result } = renderHook(() => useCodeBlock(raw));

    await act(async () => {
      await result.current.onCopy();
    });

    expect(writeTextMock).toHaveBeenCalledWith(raw);
  });

  it('flips isCopied true and back to false after the confirmation window', async () => {
    vi.useFakeTimers();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeTextMock);

    const { result } = renderHook(() => useCodeBlock('{"a":1}'));

    await act(async () => {
      await result.current.onCopy();
    });

    expect(result.current.isCopied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(COPY_CONFIRMATION_MS);
    });

    expect(result.current.isCopied).toBe(false);
  });

  it('keeps isCopied true and restarts the window on a second copy inside it', async () => {
    vi.useFakeTimers();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeTextMock);

    const { result } = renderHook(() => useCodeBlock('{"a":1}'));

    await act(async () => {
      await result.current.onCopy();
    });

    await act(async () => {
      vi.advanceTimersByTime(COPY_CONFIRMATION_MS - 200);
    });

    expect(result.current.isCopied).toBe(true);

    await act(async () => {
      await result.current.onCopy();
    });

    await act(async () => {
      vi.advanceTimersByTime(COPY_CONFIRMATION_MS - 200);
    });

    expect(result.current.isCopied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.isCopied).toBe(false);
  });

  it('clears the timer on unmount and produces no post-unmount state update', async () => {
    vi.useFakeTimers();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeTextMock);

    const { result, unmount } = renderHook(() => useCodeBlock('{"a":1}'));

    await act(async () => {
      await result.current.onCopy();
    });

    expect(() => {
      unmount();
      vi.advanceTimersByTime(COPY_CONFIRMATION_MS);
    }).not.toThrow();
  });

  it('leaves isCopied false and throws nothing when the clipboard write rejects', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('denied'));
    stubClipboard(writeTextMock);

    const { result } = renderHook(() => useCodeBlock('{"a":1}'));

    await act(async () => {
      result.current.onCopy();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isCopied).toBe(false);
  });
});
