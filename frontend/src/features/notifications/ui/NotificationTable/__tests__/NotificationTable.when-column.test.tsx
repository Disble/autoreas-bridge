import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { NotificationTable } from '../NotificationTable';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** One row whose age is what every assertion below is about. */
const ROWS: readonly NotificationRow[] = [
  { id: 1, createdAtMs: 1_700_000_000_000, title: 'Download stopped', body: '', level: 'warning', source: 'download', actionCount: 0 },
];

/**
 * Renders the table with the clock frozen 5 minutes past the fixture row, so
 * the relative label is a fixed string rather than whatever today is.
 * @returns Nothing.
 */
function renderFiveMinutesLater(): void {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(1_700_000_300_000));

  render(
    <NotificationTable
      onScroll={vi.fn()}
      onSelectionChange={vi.fn()}
      renderEmptyState={() => <span>Empty</span>}
      rows={ROWS}
      selectedKeys={new Set()}
    />,
  );
}

describe('NotificationTable "When" column', () => {
  it('answers how long ago the record arrived, which is the half that says whether it still matters', () => {
    renderFiveMinutesLater();

    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('no longer spends the column on an absolute stamp that did not fit it', () => {
    renderFiveMinutesLater();

    // The stamp is still reachable -- it is just no longer the visible text
    // that an 84px column truncated down to "2026-08...".
    expect(screen.queryByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)).not.toBeInTheDocument();
  });

  it('keeps the exact local timestamp reachable, beside the relative one', () => {
    renderFiveMinutesLater();

    // Read through the accessible name rather than by opening the tooltip:
    // React Aria's grid moves focus off an in-row tooltip trigger and onto the
    // row itself, so the cell can never be focused and the tooltip is a
    // hover-only affordance. The name is the path that survives that.
    expect(screen.getByRole('button', { name: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} · 5m ago$/ })).toBeInTheDocument();
  });
});
