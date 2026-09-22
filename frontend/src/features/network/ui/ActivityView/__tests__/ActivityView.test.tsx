import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../ActivityOverview/ActivityOverview', () => ({
  ActivityOverview: ({ statusStrip }: { statusStrip?: ReactNode }) => (
    <div>Activity Overview Panel{statusStrip}</div>
  ),
}));
vi.mock('../../NetworkPanel/NetworkPanel', () => ({
  NetworkPanel: () => <div>Network Panel</div>,
}));
vi.mock('../../TransactionPanel/TransactionPanel', () => ({
  TransactionPanel: () => <div>Transaction Panel</div>,
}));

import { ActivityView } from '../ActivityView';

describe('ActivityView', () => {
  afterEach(() => {
    cleanup();
  });

  it('offers the Overview as a tab beside Transactions and Runtime Events', () => {
    render(<ActivityView />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Transactions',
      'Runtime Events',
    ]);
  });

  it('keeps Transactions as the default tab, so adding the Overview moves nobody', () => {
    render(<ActivityView />);

    expect(screen.getByText('Transaction Panel')).toBeInTheDocument();
    expect(screen.queryByText('Activity Overview Panel')).not.toBeInTheDocument();
  });

  it('opens directly on the Overview when asked for it', () => {
    render(<ActivityView initialTab="overview" />);

    expect(screen.getByText('Activity Overview Panel')).toBeInTheDocument();
  });

  it('still opens directly on the Runtime Events tab', () => {
    render(<ActivityView initialTab="runtime-events" />);

    expect(screen.getByText('Network Panel')).toBeInTheDocument();
  });

  it('renders the route-composed status strip inside the Overview tab', () => {
    render(<ActivityView initialTab="overview" statusStrip={<div>status strip marker</div>} />);

    expect(screen.getByText('Activity Overview Panel')).toBeInTheDocument();
    expect(screen.getByText('status strip marker')).toBeInTheDocument();
  });

  it('keeps the status strip out of the other tabs, where absence renders nothing', () => {
    render(<ActivityView statusStrip={<div>status strip marker</div>} />);

    expect(screen.getByText('Transaction Panel')).toBeInTheDocument();
    expect(screen.queryByText('Activity Overview Panel')).not.toBeInTheDocument();
    expect(screen.queryByText('status strip marker')).not.toBeInTheDocument();
  });
});
