import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationSelectionBar } from '../NotificationSelectionBar';

afterEach(cleanup);

describe('NotificationSelectionBar', () => {
  it('renders nothing while no rows are selected', () => {
    const { container } = render(
      <NotificationSelectionBar
        onArchive={vi.fn()}
        onClearSelection={vi.fn()}
        onMarkRead={vi.fn()}
        onRestore={vi.fn()}
        selectedCount={0}
        view="active"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count and bulk actions once one or more rows are selected', () => {
    render(
      <NotificationSelectionBar
        onArchive={vi.fn()}
        onClearSelection={vi.fn()}
        onMarkRead={vi.fn()}
        onRestore={vi.fn()}
        selectedCount={3}
        view="active"
      />,
    );

    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark read/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
  });

  it('forwards each bulk action to its callback', () => {
    const onMarkRead = vi.fn();
    const onArchive = vi.fn();
    const onClearSelection = vi.fn();
    render(
      <NotificationSelectionBar
        onArchive={onArchive}
        onClearSelection={onClearSelection}
        onMarkRead={onMarkRead}
        onRestore={vi.fn()}
        selectedCount={2}
        view="active"
      />,
    );

    screen.getByRole('button', { name: /mark read/i }).click();
    screen.getByRole('button', { name: /archive/i }).click();
    screen.getByRole('button', { name: /clear selection/i }).click();

    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('swaps Archive for Restore in the archived view, and wires it to onRestore', () => {
    const onArchive = vi.fn();
    const onRestore = vi.fn();
    render(
      <NotificationSelectionBar
        onArchive={onArchive}
        onClearSelection={vi.fn()}
        onMarkRead={vi.fn()}
        onRestore={onRestore}
        selectedCount={1}
        view="archived"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Restore' }).click();

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it('offers Archive and not Restore in the active view', () => {
    render(
      <NotificationSelectionBar
        onArchive={vi.fn()}
        onClearSelection={vi.fn()}
        onMarkRead={vi.fn()}
        onRestore={vi.fn()}
        selectedCount={1}
        view="active"
      />,
    );

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });

  it('disappears once the selection is cleared (rerenders with selectedCount 0)', () => {
    const { container, rerender } = render(
      <NotificationSelectionBar
        onArchive={vi.fn()}
        onClearSelection={vi.fn()}
        onMarkRead={vi.fn()}
        onRestore={vi.fn()}
        selectedCount={1}
        view="active"
      />,
    );
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();

    rerender(
      <NotificationSelectionBar
        onArchive={vi.fn()}
        onClearSelection={vi.fn()}
        onMarkRead={vi.fn()}
        onRestore={vi.fn()}
        selectedCount={0}
        view="active"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
