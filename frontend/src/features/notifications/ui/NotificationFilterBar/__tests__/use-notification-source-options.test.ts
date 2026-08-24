import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationSourceOptions } from '../use-notification-source-options';

/**
 * Builds a row carrying only the source this hook reads.
 * @param id The record id.
 * @param source The row's producing bounded context.
 * @returns One `NotificationRow`.
 */
function rowFrom(id: number, source: string): NotificationRow {
  return { id, createdAtMs: 1_000 * id, title: `Row ${id}`, body: '', level: 'info', source, actionCount: 0 };
}

describe('useNotificationSourceOptions', () => {
  it('offers one option per source the loaded rows carry', () => {
    const { result } = renderHook(() => useNotificationSourceOptions([rowFrom(1, 'download'), rowFrom(2, 'season')]));

    expect(result.current).toEqual([
      { value: 'download', label: 'Download' },
      { value: 'season', label: 'Season' },
    ]);
  });

  it('keeps a source it has already offered once a narrowed page stops carrying it', () => {
    // Without this, picking "Season" would empty the dropdown of every other
    // source, and the user could never switch to one.
    const { rerender, result } = renderHook((rows: readonly NotificationRow[]) => useNotificationSourceOptions(rows), {
      initialProps: [rowFrom(1, 'download'), rowFrom(2, 'season')] as readonly NotificationRow[],
    });

    rerender([rowFrom(2, 'season')]);

    expect(result.current.map((option) => option.value)).toEqual(['download', 'season']);
  });

  it('offers nothing before any row has arrived', () => {
    const { result } = renderHook(() => useNotificationSourceOptions([]));

    expect(result.current).toEqual([]);
  });
});
