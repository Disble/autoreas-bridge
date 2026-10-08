import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { memo, type FunctionComponent, type NamedExoticComponent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTransactionStore } from '../../../../../shared/store/transaction-store/transaction-store.helpers';
import type { TransactionRowProps } from '../transaction-panel.types';
import { TransactionPanel } from '../TransactionPanel';
import {
  capturePage,
  createFakeSource,
  createPushableRuntimeSource,
  renderedRoutes,
  row,
  rows,
  ROW_HEIGHT_PX,
  scroller,
  scrollToOffset,
  settleAsyncPasses,
} from './transaction-panel.test-helpers';

/**
 * Routes of the rows whose body actually ran, written INSIDE the real row's memo
 * boundary. A passthrough outside the memo would count every table render; this
 * one counts only the renders the memo failed to skip, which is what a scroll or
 * a push costs per row.
 */
const { renderedRowRoutes } = vi.hoisted(() => ({ renderedRowRoutes: [] as string[] }));

vi.mock('../../TransactionRow/TransactionRow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../TransactionRow/TransactionRow')>();
  /** The real memoized row, read through React's memo shape to reuse its body and comparator. */
  const real = actual.TransactionRow as unknown as NamedExoticComponent<TransactionRowProps> & {
    /** The component the memo wraps. */
    readonly type: FunctionComponent<TransactionRowProps>;
    /** The memo comparator; `null` means React's shallow props check. */
    readonly compare: ((previous: TransactionRowProps, next: TransactionRowProps) => boolean) | null;
  };

  return {
    TransactionRow: memo(
      /**
       * Records the row and renders the real body under the real comparator.
       * @param props The row props the table hands down.
       * @returns The real row's element.
       */
      function CountedTransactionRow(props: Readonly<TransactionRowProps>) {
        renderedRowRoutes.push(props.row.route);

        return real.type(props);
      },
      real.compare ?? undefined,
    ),
  };
});

/**
 * Lists the routes mounted now that were not mounted before.
 * @param before The routes mounted before the stimulus.
 * @returns The routes that entered the window.
 */
function enteredRoutes(before: readonly string[]): readonly string[] {
  return renderedRoutes().filter((route) => !before.includes(route));
}

describe('TransactionPanel — row identity across window changes', () => {
  beforeEach(() => {
    renderedRowRoutes.length = 0;
  });

  afterEach(() => {
    cleanup();
    resetTransactionStore();
  });

  it('a one-row scroll re-renders only the row that entered the window', async () => {
    render(<TransactionPanel source={createFakeSource({ listTransactions: vi.fn().mockResolvedValue(capturePage(rows(150))) })} />);
    await settleAsyncPasses();
    scrollToOffset(40 * ROW_HEIGHT_PX);
    const before = renderedRoutes();
    renderedRowRoutes.length = 0;

    scrollToOffset(41 * ROW_HEIGHT_PX);

    expect(enteredRoutes(before)).toHaveLength(1);
    expect(renderedRowRoutes).toEqual(enteredRoutes(before));
  });

  it('a live pushed capture re-renders none of the rows it leaves in view', async () => {
    const { runtimeSource, push } = createPushableRuntimeSource();
    render(
      <TransactionPanel
        runtimeSource={runtimeSource}
        source={createFakeSource({ listTransactions: vi.fn().mockResolvedValue(capturePage(rows(30), 'cursor-1')) })}
      />,
    );
    await settleAsyncPasses();
    scrollToOffset(800);
    const before = renderedRoutes();
    renderedRowRoutes.length = 0;

    act(() => {
      push(row({ requestId: 'req-live', route: '/api/animes/anime-live', capturedAtMs: 200_000 }));
    });
    // jsdom fires no scroll event for the prepend's offset compensation; a real engine does.
    fireEvent.scroll(scroller());

    expect(renderedRoutes()).toEqual(before);
    // Only the row above the window may render: the push shifts the window for
    // one pass before the offset compensation moves it back.
    expect(renderedRowRoutes.filter((route) => before.includes(route))).toEqual([]);
  });
});
