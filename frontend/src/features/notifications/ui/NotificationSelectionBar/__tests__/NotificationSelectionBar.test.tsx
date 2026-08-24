import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationSelectionBar } from '../NotificationSelectionBar';

afterEach(cleanup);

describe('NotificationSelectionBar', () => {
  it('renders nothing while no rows are selected', () => {
    const { container } = render(
      <NotificationSelectionBar onArchive={vi.fn()} onClearSelection={vi.fn()} onMarkRead={vi.fn()} selectedCount={0} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count and bulk actions once one or more rows are selected', () => {
    render(<NotificationSelectionBar onArchive={vi.fn()} onClearSelection={vi.fn()} onMarkRead={vi.fn()} selectedCount={3} />);

    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark read/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
  });

  it('forwards each bulk action to its callback', () => {
    const onMarkRead = vi.fn();
    const onArchive = vi.fn();
    const onClearSelection = vi.fn();
    render(<NotificationSelectionBar onArchive={onArchive} onClearSelection={onClearSelection} onMarkRead={onMarkRead} selectedCount={2} />);

    screen.getByRole('button', { name: /mark read/i }).click();
    screen.getByRole('button', { name: /archive/i }).click();
    screen.getByRole('button', { name: /clear selection/i }).click();

    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('disappears once the selection is cleared (rerenders with selectedCount 0)', () => {
    const { container, rerender } = render(
      <NotificationSelectionBar onArchive={vi.fn()} onClearSelection={vi.fn()} onMarkRead={vi.fn()} selectedCount={1} />,
    );
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();

    rerender(<NotificationSelectionBar onArchive={vi.fn()} onClearSelection={vi.fn()} onMarkRead={vi.fn()} selectedCount={0} />);

    expect(container).toBeEmptyDOMElement();
  });
});
