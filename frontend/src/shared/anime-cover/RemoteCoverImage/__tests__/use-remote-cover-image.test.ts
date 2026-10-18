import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useRemoteCoverImage } from '../use-remote-cover-image';

describe('useRemoteCoverImage', () => {
  it('reports no failure until the image errors, then reports one', () => {
    const { result } = renderHook(() => useRemoteCoverImage('https://cdn.example/a.jpg'));

    expect(result.current.hasFailed).toBe(false);

    act(() => {
      result.current.onError();
    });

    expect(result.current.hasFailed).toBe(true);
  });

  it('clears the failure when the source changes, so a new image gets its own attempt', () => {
    const { result, rerender } = renderHook(({ src }) => useRemoteCoverImage(src), {
      initialProps: { src: 'https://cdn.example/a.jpg' },
    });
    act(() => {
      result.current.onError();
    });

    rerender({ src: 'https://cdn.example/b.jpg' });

    expect(result.current.hasFailed).toBe(false);
  });

  it('records a failure against the new source after the source changes', () => {
    const { result, rerender } = renderHook(({ src }) => useRemoteCoverImage(src), {
      initialProps: { src: 'https://cdn.example/a.jpg' },
    });

    rerender({ src: 'https://cdn.example/b.jpg' });
    act(() => {
      result.current.onError();
    });

    expect(result.current.hasFailed).toBe(true);
  });
});
