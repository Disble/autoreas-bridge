import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getSQLiteStatusMock = vi.fn();

vi.mock('../../../dashboard.bindings', () => ({
  getSQLiteStatus: () => getSQLiteStatusMock(),
}));

import { useBridgeStatusCard } from '../use-bridge-status-card';

describe('useBridgeStatusCard', () => {
  it('loads the sqlite status on mount', async () => {
    getSQLiteStatusMock.mockResolvedValueOnce('ok');

    const { result } = renderHook(() => useBridgeStatusCard());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.sqliteStatus).toBe('ok');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.statusTone).toBe('success');
  });
});
