import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NotificationEmptyState } from '../NotificationEmptyState';
import type { NotificationEmptyStateProps } from '../notification-empty-state.types';

afterEach(cleanup);

/** A healthy store with records, on the active view, with no filters: override what each case needs. */
const BASE: NotificationEmptyStateProps = {
  hasFilters: false,
  serviceAvailable: true,
  totalEverRecorded: 10,
  unreadOnly: false,
  view: 'active',
};

describe('NotificationEmptyState', () => {
  it('shows the mascot on the shared shell when nothing has ever been recorded', () => {
    const { container } = render(<NotificationEmptyState {...BASE} totalEverRecorded={0} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Nothing here yet' })).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('[data-airis-icon]')).toBeNull();
  });

  it.each([
    ['filters-empty', { hasFilters: true }, 'No matches', 'filtered'],
    ['archived-empty', { view: 'archived' }, 'Nothing archived yet', 'filtered'],
    ['unread-none', { unreadOnly: true }, 'All caught up', 'caught-up'],
    ['active-all-archived', {}, 'All archived', 'caught-up'],
  ] as const)('shows %s with its icon and no mascot', (_state, overrides, title, kind) => {
    const { container } = render(<NotificationEmptyState {...BASE} {...overrides} />);

    expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
    expect(container.querySelector(`[data-airis-icon="${kind}"]`)).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('reports an unreachable service as a failure Alert, never as an empty state', () => {
    const { container } = render(<NotificationEmptyState {...BASE} serviceAvailable={false} totalEverRecorded={0} />);

    expect(screen.getByText('Notifications unavailable')).toBeInTheDocument();
    expect(screen.getByText('The notification service could not be reached. Try again later.')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="alert"], .alert')).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
