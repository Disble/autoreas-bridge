import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../ActivityOverview/ActivityOverview', () => ({
  ActivityOverview: () => <div>Activity Overview Panel</div>,
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
});
