import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationDetailRow } from '../../../../../shared/contracts/notification-center.types';
import type { NotificationDetailCoverSource } from '../use-notification-detail-covers';
import { useNotificationDetailCovers } from '../use-notification-detail-covers';

/** Minimal row fixture builder, matching `notification-detail.helpers.test.ts`'s own. */
function buildRow(overrides: Partial<NotificationDetailRow> = {}): NotificationDetailRow {
  return { detail: 'x', name: 'Some Anime', refId: 'anime-1', refType: 'anime', status: 'Stopped', ...overrides };
}

describe('useNotificationDetailCovers', () => {
  it('resolves a cover for an anime-typed row', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,abc', source: 'cover' });
    const source: NotificationDetailCoverSource = { getAnimeCover };

    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()], source));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ dataUrl: 'data:image/png;base64,abc', status: 'cover' }));
    expect(getAnimeCover).toHaveBeenCalledWith('anime-1');
  });

  it('falls back to the placeholder when the resolver reports no cover', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
    const source: NotificationDetailCoverSource = { getAnimeCover };

    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()], source));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ status: 'placeholder' }));
  });

  it('falls back to the placeholder when the resolver rejects', async () => {
    const getAnimeCover = vi.fn().mockRejectedValue(new Error('boom'));
    const source: NotificationDetailCoverSource = { getAnimeCover };

    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()], source));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ status: 'placeholder' }));
  });

  it('falls back to the placeholder when the resolver reports a cover source with no dataUrl', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover' });
    const source: NotificationDetailCoverSource = { getAnimeCover };

    const { result } = renderHook(() => useNotificationDetailCovers([buildRow()], source));

    await waitFor(() => expect(result.current.get('anime-1')).toStrictEqual({ status: 'placeholder' }));
  });

  it('never attempts a fetch for a non-anime ref type', () => {
    const getAnimeCover = vi.fn();
    const source: NotificationDetailCoverSource = { getAnimeCover };

    renderHook(() => useNotificationDetailCovers([buildRow({ refId: 'link-1', refType: 'link' })], source));

    expect(getAnimeCover).not.toHaveBeenCalled();
  });

  it('fetches each unique anime id exactly once across re-renders with the same rows', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
    const source: NotificationDetailCoverSource = { getAnimeCover };
    const rows = [buildRow()];

    const { rerender } = renderHook(({ rowsArg }) => useNotificationDetailCovers(rowsArg, source), { initialProps: { rowsArg: rows } });
    rerender({ rowsArg: rows });

    await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
  });

  it('fetches a newly-appeared row id once rows grow across a re-render, not just on first mount', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
    const source: NotificationDetailCoverSource = { getAnimeCover };
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
