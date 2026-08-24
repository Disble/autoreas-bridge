import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationFilterBar } from '../NotificationFilterBar';

afterEach(cleanup);

describe('NotificationFilterBar', () => {
  it('renders a labeled search field seeded with the caller-provided value', () => {
    render(<NotificationFilterBar onSearchInputChange={vi.fn()} searchInput="one piece" />);

    expect(screen.getByLabelText('Search notifications')).toHaveValue('one piece');
  });

  it('forwards every keystroke to onSearchInputChange', () => {
    const onSearchInputChange = vi.fn();
    render(<NotificationFilterBar onSearchInputChange={onSearchInputChange} searchInput="" />);

    fireEvent.change(screen.getByLabelText('Search notifications'), { target: { value: 'frieren' } });

    expect(onSearchInputChange).toHaveBeenCalledWith('frieren');
  });
});
