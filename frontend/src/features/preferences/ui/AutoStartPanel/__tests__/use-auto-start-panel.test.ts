import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAutoStartPanel } from '../use-auto-start-panel';

describe('useAutoStartPanel', () => {
  it('loads the persisted preference', async () => {
    const source = { getAutoStartEnabled: vi.fn().mockResolvedValue(false), setAutoStartEnabled: vi.fn() };
    const { result } = renderHook(() =>
      useAutoStartPanel({ source }),
    );

    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it('persists a changed preference', async () => {
    const getAutoStartEnabled = vi.fn().mockResolvedValue(false);
    const setAutoStartEnabled = vi.fn().mockResolvedValue('ok');
    const source = { getAutoStartEnabled, setAutoStartEnabled };
    const { result } = renderHook(() => useAutoStartPanel({ source }));

    await waitFor(() => expect(result.current.enabled).toBe(false));

    await act(async () => {
      await result.current.onEnabledChange(true);
    });

    expect(setAutoStartEnabled).toHaveBeenCalledWith(true);
    expect(result.current.enabled).toBe(true);
  });
});
