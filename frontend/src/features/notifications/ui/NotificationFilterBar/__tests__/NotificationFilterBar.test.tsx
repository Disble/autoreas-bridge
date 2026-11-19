import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationFilterBar } from '../NotificationFilterBar';
import type { NotificationFilterBarProps } from '../notification-filter-bar.types';

afterEach(cleanup);

/**
 * Builds the bar's full prop set, overridden per case.
 * @param overrides The props a case is about.
 * @returns A complete `NotificationFilterBarProps`.
 */
function props(overrides: Partial<NotificationFilterBarProps> = {}): NotificationFilterBarProps {
  return {
    searchInput: '',
    onSearchInputChange: vi.fn(),
    view: 'active',
    onViewChange: vi.fn(),
    levels: [],
    onLevelsChange: vi.fn(),
    sources: [],
    onSourcesChange: vi.fn(),
    sourceOptions: [],
    ...overrides,
  };
}

describe('NotificationFilterBar', () => {
  it('renders a labeled search field seeded with the caller-provided value', () => {
    render(<NotificationFilterBar {...props({ searchInput: 'one piece' })} />);

    expect(screen.getByLabelText('Search notifications')).toHaveValue('one piece');
  });

  it('forwards every keystroke to onSearchInputChange', () => {
    const onSearchInputChange = vi.fn();
    render(<NotificationFilterBar {...props({ onSearchInputChange })} />);

    fireEvent.change(screen.getByLabelText('Search notifications'), { target: { value: 'frieren' } });

    expect(onSearchInputChange).toHaveBeenCalledWith('frieren');
  });

  it('offers the four views the Main artboard draws and reports the view the user pressed', () => {
    const onViewChange = vi.fn();
    render(<NotificationFilterBar {...props({ onViewChange })} />);

    for (const label of ['Active', 'Unread', 'Read', 'Archived']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));

    expect(onViewChange).toHaveBeenLastCalledWith('archived');

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));

    expect(onViewChange).toHaveBeenLastCalledWith('unread');
  });

  it('marks and shows the switch matching the caller-provided view as pressed, and only that one', () => {
    render(<NotificationFilterBar {...props({ view: 'archived' })} />);

    expect(screen.getByRole('button', { name: 'Archived' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Read' })).toHaveAttribute('aria-pressed', 'false');
    // aria-pressed alone leaves the strip looking identical on every tab to a
    // sighted user, which is what the artboard's filled pill is for.
    expect(screen.getByRole('button', { name: 'Archived' }).className).toContain('button--primary');
    expect(screen.getByRole('button', { name: 'Active' }).className).toContain('button--tertiary');
  });

  it('offers the four closed level values and reports the level the user picked', () => {
    const onLevelsChange = vi.fn();
    render(<NotificationFilterBar {...props({ onLevelsChange })} />);

    fireEvent.click(screen.getByRole('button', { name: /filter by level/i }));

    for (const label of ['Info', 'Success', 'Warning', 'Error']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('option', { name: 'Warning' }));

    expect(onLevelsChange).toHaveBeenCalledWith(['warning']);
  });

  it('offers only the caller-derived sources and reports the one picked', () => {
    const onSourcesChange = vi.fn();
    render(<NotificationFilterBar {...props({ onSourcesChange, sourceOptions: [{ value: 'season', label: 'Season' }] })} />);

    fireEvent.click(screen.getByRole('button', { name: /filter by source/i }));

    expect(screen.getByRole('option', { name: 'Season' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Download' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Season' }));

    expect(onSourcesChange).toHaveBeenCalledWith(['season']);
  });
});
