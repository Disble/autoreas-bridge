import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { NotificationTable } from '../NotificationTable';

afterEach(cleanup);

/** Two fixture rows shared across every render assertion below. */
const ROWS: readonly NotificationRow[] = [
  { id: 1, createdAtMs: 1_700_000_000_000, title: 'First notification', body: '', level: 'info', source: 'download', actionCount: 0 },
  { id: 2, createdAtMs: 1_700_000_100_000, title: 'Second notification', body: '', level: 'warning', source: 'season', actionCount: 0 },
];

describe('NotificationTable', () => {
  it('renders every provided row', () => {
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set()}
      />,
    );

    expect(screen.getByText('First notification')).toBeInTheDocument();
    expect(screen.getByText('Second notification')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // 2 data rows + 1 header row
  });

  it('sorts the "When" column descending by default, with no user interaction (task 3a.2.5)', () => {
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set()}
      />,
    );

    const whenColumnHeader = screen.getByRole('columnheader', { name: /when/i });
    expect(whenColumnHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('renders a notification’s own body line when the record carries one', () => {
    // The duration-notice shape: a title stating the fact, a body stating the
    // numbers, and one anime row behind them. The list used to paint only the
    // title and the subject, so the numbers never reached the reader here.
    const row: NotificationRow = {
      id: 3,
      createdAtMs: 1_700_000_200_000,
      title: 'Capítulo largo',
      body: 'Episodio 7 · 45 minutos',
      level: 'info',
      source: 'anime',
      actionCount: 0,
      subjects: ['Bleach Sennen Kessen-hen'],
    };
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={[row]}
        selectedKeys={new Set()}
      />,
    );

    expect(screen.getByTestId('notification-table-body')).toHaveTextContent('Episodio 7 · 45 minutos');
  });

  it('clips a long body inside its column with the title line’s own shrink discipline', () => {
    // jsdom has no layout engine, so this pins the guard rather than the
    // boxes: the body line must carry the same `min-w-0` + `truncate`
    // discipline as the title line, or a long body widens the row instead of
    // clipping inside its column. Removing either class must fail this test;
    // the boxes themselves are the layout gate’s job, which mounts no table.
    const row: NotificationRow = {
      id: 5,
      createdAtMs: 1_700_000_400_000,
      title: 'Capítulo largo',
      body: `Episodio 7 · ${'x'.repeat(500)}`,
      level: 'info',
      source: 'anime',
      actionCount: 0,
    };
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={[row]}
        selectedKeys={new Set()}
      />,
    );

    const bodyLine = screen.getByTestId('notification-table-body');
    expect(bodyLine).toHaveTextContent(row.body);
    expect(bodyLine).toHaveClass('truncate');
    expect(bodyLine).toHaveClass('min-w-0');
  });

  it('renders the body beside the subjects rather than instead of them', () => {
    // The run-notification shape: its own sentence AND the anime it is about.
    // Showing the body must not cost the subject line the row already had.
    const row: NotificationRow = {
      id: 4,
      createdAtMs: 1_700_000_300_000,
      title: 'Download run stopped',
      body: 'Stopped by request -- 2 episode(s) downloaded.',
      level: 'warning',
      source: 'download',
      actionCount: 0,
      subjects: ['Frieren', 'Eureka'],
    };
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={[row]}
        selectedKeys={new Set()}
      />,
    );

    expect(screen.getByTestId('notification-table-body')).toHaveTextContent('Stopped by request -- 2 episode(s) downloaded.');
    expect(screen.getByTestId('notification-table-subjects')).toHaveTextContent('Frieren · Eureka');
  });

  it('grows no body line for a record carrying none, leaving its row exactly as today', () => {
    // Element-presence check: an empty <p> and no <p> at all look identical
    // to a text query, and every existing producer row takes this branch.
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set()}
      />,
    );

    expect(screen.queryByTestId('notification-table-body')).not.toBeInTheDocument();
  });

  it('renders the caller-provided empty state when there are no rows', () => {
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Nothing here yet</span>}
        rows={[]}
        selectedKeys={new Set()}
      />,
    );

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders one selection checkbox per data row plus a "select all" checkbox in the header (task 3b.1.5)', () => {
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set()}
      />,
    );

    // 2 data rows + 1 header "select all" checkbox.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('marks a row selected when its id is present in selectedKeys', () => {
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set([1])}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // The first checkbox is the header "select all"; row order after that
    // follows ROWS' order (id 1, then id 2).
    expect(checkboxes[1]?.checked).toBe(true);
    expect(checkboxes[2]?.checked).toBe(false);
  });

  it('forwards a row toggle to onSelectionChange', () => {
    const onSelectionChange = vi.fn();
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={onSelectionChange}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes[1]?.click();

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange.mock.calls[0]?.[0]).toBeInstanceOf(Set);
    expect([...(onSelectionChange.mock.calls[0]?.[0] as Set<number>)]).toEqual([1]);
  });
});
