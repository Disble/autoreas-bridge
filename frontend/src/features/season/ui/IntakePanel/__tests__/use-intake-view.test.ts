import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { IntakeMode } from '../intake-panel.types';
import { useIntakeView } from '../use-intake-view';

/** The inputs a case can change between renders. */
interface ViewProps {
  /** How many rows are discarded. */
  readonly count: number;
  /** The editing mode. */
  readonly mode: IntakeMode;
}

/**
 * Renders the view hook over a discarded-row count and a mode the case can change.
 * @param discardedCount The initial number of discarded rows.
 * @returns The hook harness.
 */
function renderView(discardedCount: number) {
  return renderHook(({ count, mode }: ViewProps) => useIntakeView(count, mode), { initialProps: { count: discardedCount, mode: 'list' } as ViewProps });
}

describe('useIntakeView', () => {
  it('starts on the active rows', () => {
    const { result } = renderView(2);

    expect(result.current.view).toBe('active');
  });

  it('switches to the discarded rows from the toggle key and ignores an unknown key', () => {
    const { result } = renderView(2);

    act(() => {
      result.current.onViewChange('discarded');
    });
    expect(result.current.view).toBe('discarded');

    act(() => {
      result.current.onViewChange('raw');
    });
    expect(result.current.view).toBe('discarded');
  });

  it('shows the active rows in Raw mode and returns to the picked view back in List mode', () => {
    const { result, rerender } = renderView(2);
    act(() => {
      result.current.onViewChange('discarded');
    });

    rerender({ count: 2, mode: 'raw' });
    expect(result.current.view).toBe('active');

    rerender({ count: 2, mode: 'list' });
    expect(result.current.view).toBe('discarded');
  });

  it('falls back to the active rows once the last discarded row is restored, and stays there', () => {
    const { result, rerender } = renderView(1);
    act(() => {
      result.current.onViewChange('discarded');
    });

    rerender({ count: 0, mode: 'list' });
    expect(result.current.view).toBe('active');

    rerender({ count: 1, mode: 'list' });
    expect(result.current.view).toBe('active');
  });
});
