import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeEventPage } from '../../../../../shared/contracts/runtime-event.types';
import { resetNetworkStore } from '../../../../../shared/store/network-store/network-store.helpers';
import { useNetworkPanel } from '../use-network-panel';
import { createFakeSource, eventPage, record } from './network-panel.test-support';

/**
 * Composition-root behaviour of the Runtime Events rail: what the panel reads,
 * projects and exposes. The asynchronous edges it composes — paging, the live
 * overlay, availability and the persisted sibling lookup — live in
 * `use-network-panel-sync.test.ts`, which is where this file was split when it
 * crossed the 500-line hard limit.
 */
describe('useNetworkPanel', () => {
  afterEach(() => {
    resetNetworkStore();
  });

  it('starts with no rows, no selection, and isLoading true before the first page resolves', () => {
    let resolvePage: ((value: RuntimeEventPage) => void) | undefined;
    const source = createFakeSource({
      searchEvents: vi.fn().mockImplementation(
        () =>
          new Promise<RuntimeEventPage>((resolve) => {
            resolvePage = resolve;
          }),
      ),
    });

    const { result } = renderHook(() => useNetworkPanel(source));

    expect(result.current.rows).toEqual([]);
    expect(result.current.selectedEntry).toBeNull();
    expect(result.current.isLoading).toBe(true);

    act(() => {
      resolvePage?.(eventPage([]));
    });
  });

  it('renders one row per persisted event once the first page resolves', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(
        eventPage([
          record(2, { domain: 'anime', message: 'publishing anime.changed' }),
          record(1, { domain: 'sync', message: 'syncing catalogue' }),
        ]),
      ),
    });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.rows.map((row) => row.message)).toEqual(['publishing anime.changed', 'syncing catalogue']);
  });

  it('resets the detail tab to "general" whenever the selected id changes', async () => {
    const source = createFakeSource({ searchEvents: vi.fn().mockResolvedValue(eventPage([record(1), record(2)])) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    act(() => {
      result.current.onSelect('event-1');
    });
    act(() => {
      result.current.onDetailTabChange('metadata');
    });

    expect(result.current.detailTab).toBe('metadata');

    act(() => {
      result.current.onSelect('event-2');
    });

    expect(result.current.detailTab).toBe('general');
  });

  it('onClose deselects the row and clears the detail', async () => {
    const source = createFakeSource({ searchEvents: vi.fn().mockResolvedValue(eventPage([record(1)])) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });

    act(() => {
      result.current.onSelect('event-1');
    });

    expect(result.current.selectedDetail).not.toBeNull();

    act(() => {
      result.current.onClose();
    });

    expect(result.current.selectedDetail).toBeNull();
  });

  it('derives entryCount, errorCount, and shownCount from the loaded feed and the visible window', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(
        eventPage([record(1, { level: 'info' }), record(2, { level: 'error' }), record(3, { level: 'ERROR' })]),
      ),
    });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(3);
    });

    expect(result.current.entryCount).toBe(3);
    expect(result.current.errorCount).toBe(2);
    expect(result.current.shownCount).toBe(3);
  });
});
