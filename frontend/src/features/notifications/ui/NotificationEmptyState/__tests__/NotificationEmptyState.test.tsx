import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NotificationEmptyState } from '../NotificationEmptyState';

afterEach(cleanup);

describe('NotificationEmptyState', () => {
  it('renders the "never recorded" copy when nothing has ever been recorded', () => {
    render(
      <NotificationEmptyState
        hasFilters={false}
        serviceAvailable={true}
        totalEverRecorded={0}
        unreadOnly={false}
        view="active"
      />,
    );

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders the "unavailable" copy when the service cannot be reached', () => {
    render(
      <NotificationEmptyState
        hasFilters={false}
        serviceAvailable={false}
        totalEverRecorded={0}
        unreadOnly={false}
        view="active"
      />,
    );

    expect(screen.getByText('Notifications unavailable')).toBeInTheDocument();
  });

  it('renders the "archived-empty" copy when the archived view has nothing archived', () => {
    render(
      <NotificationEmptyState
        hasFilters={false}
        serviceAvailable={true}
        totalEverRecorded={10}
        unreadOnly={false}
        view="archived"
      />,
    );

    expect(screen.getByText('Nothing archived yet')).toBeInTheDocument();
  });
});
