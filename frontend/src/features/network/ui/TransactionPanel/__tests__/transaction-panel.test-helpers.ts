import { act, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import type { CaptureRuntimeSource } from '../../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { CaptureDetail, CaptureRow } from '../../../../../shared/contracts/capture.types';

/** Row-height estimate in px; must mirror TRANSACTION_ROW_HEIGHT_ESTIMATE_PX, as a literal on purpose. */
export const ROW_HEIGHT_PX = 36;

/** Overscan rows the production virtualizer runs with; must mirror TRANSACTION_VIRTUAL_OVERSCAN_ROWS. */
export const OVERSCAN_ROWS = 5;

/** Hard ceiling the virtual window must stay under however many rows are loaded. */
export const MOUNTED_ROW_CEILING = 100;

/** A load above the mounted ceiling, so "bounded" cannot pass by accident. */
export const LOADED_ROW_COUNT = 150;

/** Far-down row index the scroll test must reveal; stays inside the loaded fixture. */
export const SCROLLED_INDEX = 140;

/** Builds one capture row, overridable field by field per test. */
export function row(overrides: Partial<CaptureRow> = {}): CaptureRow {
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

/** Builds `count` newest-first rows with distinct ids and routes, as one backend page. */
export function rows(count: number, offset = 0): readonly CaptureRow[] {
  return Array.from({ length: count }, (_unused, index) =>
    row({
      requestId: `req-${offset + index}`,
      route: `/api/animes/anime-${offset + index}`,
      capturedAtMs: 100_000 - offset - index,
    }),
  );
}

/** Builds one capture-detail envelope for the selection round trip. */
export function detail(): CaptureDetail {
  return { ...row(), payload: {}, correlations: { operationRefs: [] }, deviceId: 'device-1', deviceName: 'Phone' };
}

/** Builds one page envelope, defaulting to a healthy read. */
export function capturePage(items: readonly CaptureRow[], nextCursor?: string) {
  return { items, nextCursor, appliedLimit: 25, malformedRowsSkipped: 0, warningCount: 0, degraded: false };
}

/** Builds a fake transaction source, overridable per test. */
export function createFakeSource(overrides: Partial<CaptureTransactionSource> = {}): CaptureTransactionSource {
  return {
    listTransactions: vi.fn().mockResolvedValue(capturePage([])),
    getTransaction: vi.fn().mockResolvedValue({ found: true, item: detail(), degraded: false }),
    summarizeTransactions: vi.fn().mockResolvedValue({ groups: [], degraded: false }),
    ...overrides,
  };
}

/** Builds a fake capture runtime source whose live listener the test can drive directly. */
export function createPushableRuntimeSource() {
  const listeners: ((pushed: CaptureRow) => void)[] = [];

  return {
    runtimeSource: {
      subscribeCaptureTransactions: vi.fn().mockImplementation((listener: (pushed: CaptureRow) => void) => {
        listeners.push(listener);

        return () => undefined;
      }),
    } satisfies CaptureRuntimeSource,
    push(pushed: CaptureRow) {
      for (const listener of listeners) {
        listener(pushed);
      }
    },
  };
}

/** Builds a source whose every page reports another one after it, so an unattended trigger pages forever. */
export function createEndlessSource() {
  let pagesServed = 0;
  const listTransactions = vi.fn().mockImplementation(() => {
    pagesServed += 1;

    return Promise.resolve(capturePage(rows(25, pagesServed * 25), `cursor-${pagesServed}`));
  });

  return { source: createFakeSource({ listTransactions }), listTransactions };
}

/** Flushes several microtask passes, so an unattended fetch loop has room to compound. */
export async function settleAsyncPasses(passes = 5): Promise<void> {
  // Sequential by design: each pass lets the previous fetch's continuation run.
  for (let pass = 0; pass < passes; pass += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Counts the transaction rows actually mounted, excluding the header and the spacer rows. */
export function countRenderedRows(): number {
  return document.querySelectorAll('[data-transaction-scroll] tbody tr:not([data-transaction-spacer])').length;
}

/** Reads the route cell of every mounted row, in render order. */
export function renderedRoutes(): readonly string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-transaction-scroll] tbody tr td:nth-child(3)'),
  ).map((cell) => cell.textContent ?? '');
}

/** Returns the rail's scroll container, failing loudly when the panel did not render one. */
export function scroller(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-transaction-scroll]');

  if (node === null) {
    throw new Error('the Transactions rail rendered no scroll container');
  }

  return node;
}

/** Reads a spacer row's rendered height in px, failing loudly when the spacer did not render. */
export function spacerHeightPx(position: 'bottom' | 'top'): number {
  const spacer = document.querySelector<HTMLElement>(`[data-transaction-spacer="${position}"]`);

  if (spacer === null) {
    throw new Error(`the Transactions rail rendered no "${position}" spacer row`);
  }

  return Number.parseFloat(spacer.style.height);
}

/** Installs mocked scrollTop on the rail and fires the scroll event the virtualizer observes. */
export function scrollToOffset(scrollTop: number) {
  const node = scroller();
  const state = { scrollTop };
  Object.defineProperty(node, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (value: number) => {
      state.scrollTop = value;
    },
  });
  fireEvent.scroll(node);

  return state;
}
