import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimeCoverSource } from '../../../../../shared/anime-cover/anime-cover.types';
import type { NotificationDetailRow } from '../../../../../shared/contracts/notification-center.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { BRIDGE_ANIME_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useNotificationDetailCovers } from '../use-notification-detail-covers';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Minimal row fixture builder, matching `notification-detail.helpers.test.ts`'s own. */
function buildRow(overrides: Partial<NotificationDetailRow> = {}): NotificationDetailRow {
  return { detail: 'x', name: 'Some Anime', refId: 'anime-1', refType: 'anime', status: 'Stopped', ...overrides };
}

describe('useNotificationDetailCovers', () => {
  it('reads covers through the anime module port by default', async () => {
    const getAnimeCover = vi.spyOn(BRIDGE_ANIME_SOURCE, 'getAnimeCover').mockResolvedValue({ dataUrl: 'data:image/png;base64,def', source: 'cover' });

    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()]));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ dataUrl: 'data:image/png;base64,def', status: 'cover' }));
    expect(getAnimeCover).toHaveBeenCalledWith('anime-1');
  });

  // A starting anime module rejects the read; the row keeps the placeholder for this mount.
  it('keeps the placeholder while the anime module is starting', async () => {
    vi.spyOn(BRIDGE_ANIME_SOURCE, 'getAnimeCover').mockRejectedValue(createBridgeError('unavailable', 'anime is starting'));

    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()]));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ status: 'placeholder' }));
  });

  it('resolves a cover for an anime-typed row', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,abc', source: 'cover' });
    const source: AnimeCoverSource = { getAnimeCover };

    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()], source));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ dataUrl: 'data:image/png;base64,abc', status: 'cover' }));
    expect(getAnimeCover).toHaveBeenCalledWith('anime-1');
  });

  it('falls back to the placeholder when the resolver reports no cover', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
    const source: AnimeCoverSource = { getAnimeCover };

    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()], source));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ status: 'placeholder' }));
  });

  it('falls back to the placeholder when the resolver rejects', async () => {
    const getAnimeCover = vi.fn().mockRejectedValue(new Error('boom'));
    const source: AnimeCoverSource = { getAnimeCover };

    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()], source));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ status: 'placeholder' }));
  });

  it('falls back to the placeholder when the resolver reports a cover source with no dataUrl', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover' });
    const source: AnimeCoverSource = { getAnimeCover };

    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()], source));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ status: 'placeholder' }));
  });

  it('never attempts a fetch for a non-anime ref type', () => {
    const getAnimeCover = vi.fn();
    const source: AnimeCoverSource = { getAnimeCover };

    renderHook(() => useNotificationDetailCovers([buildRow({ refId: 'link-1', refType: 'link' })], source));

    expect(getAnimeCover).not.toHaveBeenCalled();
  });

  it('fetches each unique anime id exactly once across re-renders with the same rows', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
    const source: AnimeCoverSource = { getAnimeCover };
    const rows = [buildRow()];

    const { rerender } = renderHook(({ rowsArg }) => useNotificationDetailCovers(rowsArg, source), { initialProps: { rowsArg: rows } });
    rerender({ rowsArg: rows });

    await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
  });

  it('fetches a newly-appeared row id once rows grow across a re-render, not just on first mount', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
    const source: AnimeCoverSource = { getAnimeCover };
    const first = buildRow();
    const second = buildRow({ refId: 'anime-2' });

    const { rerender } = renderHook(({ rowsArg }) => useNotificationDetailCovers(rowsArg, source), { initialProps: { rowsArg: [first] } });
    await waitFor(() => expect(getAnimeCover).toHaveBeenCalledWith('anime-1'));

    rerender({ rowsArg: [first, second] });

    await waitFor(() => expect(getAnimeCover).toHaveBeenCalledWith('anime-2'));
  });

  it('degrades to the placeholder without ever fetching when the source has no getAnimeCover binding', async () => {
    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()], {}));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ status: 'placeholder' }));
  });
});
