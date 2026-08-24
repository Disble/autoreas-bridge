import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationFilterBar } from '../NotificationFilterBar';

afterEach(cleanup);

describe('NotificationFilterBar', () => {
  it('renders a labeled search field seeded with the caller-provided value', () => {
    render(<NotificationFilterBar onSearchInputChange={vi.fn()} onViewChange={vi.fn()} searchInput="one piece" view="active" />);

    expect(screen.getByLabelText('Search notifications')).toHaveValue('one piece');
  });

  it('forwards every keystroke to onSearchInputChange', () => {
    const onSearchInputChange = vi.fn();
    render(<NotificationFilterBar onSearchInputChange={onSearchInputChange} onViewChange={vi.fn()} searchInput="" view="active" />);

    fireEvent.change(screen.getByLabelText('Search notifications'), { target: { value: 'frieren' } });

    expect(onSearchInputChange).toHaveBeenCalledWith('frieren');
  });

  it('reports the view the user pressed', () => {
    const onViewChange = vi.fn();
    render(<NotificationFilterBar onSearchInputChange={vi.fn()} onViewChange={onViewChange} searchInput="" view="active" />);

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));

    expect(onViewChange).toHaveBeenCalledWith('archived');
  });

  it('marks the switch matching the caller-provided view as pressed, and only that one', () => {
    render(<NotificationFilterBar onSearchInputChange={vi.fn()} onViewChange={vi.fn()} searchInput="" view="archived" />);

    expect(screen.getByRole('button', { name: 'Archived' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'false');
  });
});
