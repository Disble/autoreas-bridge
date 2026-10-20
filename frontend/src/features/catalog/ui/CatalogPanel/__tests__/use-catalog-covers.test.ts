import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogItemViewModel } from '../catalog-panel.types';
import { useCatalogCovers } from '../use-catalog-covers';

/** Builds a rendered Catalog item. */
function item(id: string, hasCover: boolean): CatalogItemViewModel {
  return { id, name: id, hasCover, statusLabel: 'Viendo', statusColor: 'accent', kindLabel: 'OVA', listMeta: 'OVA' };
}

describe('useCatalogCovers', () => {
  it('asks only for the rendered items that report a stored cover, and for each one the window reveals', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:a' });
    const items = [item('a', true), item('b', false)];

    const { result, rerender } = renderHook((rendered) => useCatalogCovers(rendered, { getAnimeCover }), { initialProps: items });

    await waitFor(() => expect(result.current.getCover(items[0])).toEqual({ status: 'cover', src: 'data:a' }));
    expect(getAnimeCover).toHaveBeenCalledTimes(1);
    expect(getAnimeCover).toHaveBeenCalledWith('a');
    expect(result.current.getCover(items[1])).toEqual({ status: 'placeholder' });

    rerender([...items, item('c', true)]);
    await waitFor(() => expect(getAnimeCover).toHaveBeenCalledWith('c'));
  });

  it('swaps an image that fails to decode for the poster', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:broken' });
    const items = [item('a', true)];
    const { result } = renderHook(() => useCatalogCovers(items, { getAnimeCover }));
    await waitFor(() => expect(result.current.getCover(items[0]).status).toBe('cover'));

    act(() => result.current.onCoverError('a'));

    expect(result.current.getCover(items[0])).toEqual({ status: 'placeholder' });
  });

  it('draws the poster for every item when the binding is absent', () => {
    const items = [item('a', true)];

    const { result } = renderHook(() => useCatalogCovers(items, {}));

    expect(result.current.getCover(items[0])).toEqual({ status: 'placeholder' });
  });
});
