import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useRemoteCoverImage } from '../use-remote-cover-image';

describe('useRemoteCoverImage', () => {
  it('reports a failure only once the image errors, and gives a new source its own attempt', () => {
    const { result, rerender } = renderHook(({ src }) => useRemoteCoverImage(src), {
      initialProps: { src: 'https://cdn.example/a.jpg' },
    });

    expect(result.current.hasFailed).toBe(false);

    act(() => {
      result.current.onError();
    });

    expect(result.current.hasFailed).toBe(true);

    rerender({ src: 'https://cdn.example/b.jpg' });

    expect(result.current.hasFailed).toBe(false);

    act(() => {
      result.current.onError();
    });

    expect(result.current.hasFailed).toBe(true);
  });
});
