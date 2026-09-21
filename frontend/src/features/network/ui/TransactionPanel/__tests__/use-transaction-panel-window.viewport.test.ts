import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RefCallback } from 'react';
import type { CaptureRow } from '../../../../../shared/contracts/capture.types';
import type { TransactionPanelWindowModel } from '../transaction-panel.types';
import { useTransactionPanelWindow } from '../use-transaction-panel-window';

/**
 * The platform-level viewport rows of this suite (synchronous measurement,
 * deterministic zero-height fallback, ResizeObserver lifecycle, missing
 * observer, null target window) moved verbatim to the shared window's own
 * tests at
 * `frontend/src/shared/hooks/use-virtual-rail-window/__tests__/use-virtual-rail-window.test.ts`
 * when the mechanism was extracted — every rail mounting the hook inherits
 * them. What remains here is the rail-specific half: the delegate's own
 * constant wiring, which the shared window's tests cannot pin.
 */

/** Builds one capture row, overridable field by field per test. */
function row(overrides: Partial<CaptureRow> = {}): CaptureRow {
  return {
    requestId: 'req-1',
    capturedAtMs: 1_000,
    kind: 'patch',
    route: '/api/animes/anime-1',
    transport: 'http',
    outcome: 'accepted',
    ...overrides,
  };
}

/** Builds `count` newest-first rows with distinct ids and descending timestamps. */
function rows(count: number, offset = 0): readonly CaptureRow[] {
  return Array.from({ length: count }, (_unused, index) =>
    row({ requestId: `req-${offset + index}`, capturedAtMs: 100_000 - offset - index }),
  );
}

/** Attaches a detached scroll container to the hook's scrollRef so the virtualizer can observe it. */
function attachScroller(result: { current: Pick<TransactionPanelWindowModel, 'scrollRef'> }): HTMLDivElement {
  const element = document.createElement('div');

  act(() => {
    (result.current.scrollRef as RefCallback<HTMLDivElement>)(element);
  });

  return element;
}

describe('useTransactionPanelWindow viewport wiring', () => {
  it('wires the transaction row estimate and overscan through the shared virtual window', () => {
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(60), onReachEnd: vi.fn() }));

    attachScroller(result);

    // The bare jsdom element measures 0 px high, so the shared window falls
    // back to its deterministic 600 px viewport. With the transaction
    // constants (36 px per row, 5 overscan rows) the fallback mounts
    // 600 / 36 = 17 visible rows plus the bottom overscan band, the top one
    // clamped at the rail start: 22 rows, written as a literal on purpose.
    // A delegate that stopped forwarding the transaction estimate or overscan
    // — or forwarded a drifted copy — changes this exact count; the shared
    // window's own tests cannot see this wiring.
    expect(result.current.windowedRows).toHaveLength(22);
    expect(result.current.windowedRows[0]?.requestId).toBe('req-0');
  });
});
