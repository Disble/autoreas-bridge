import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../features/dashboard/ui/BridgeStatusCard/BridgeStatusCard', () => ({
  BridgeStatusCard: () => <div>Bridge Status Card</div>,
}));
vi.mock('../../../features/network/ui/NetworkPanel/NetworkPanel', () => ({
  NetworkPanel: () => <div>Network Panel</div>,
}));

import { ActivityRoute } from '../ActivityRoute';

describe('ActivityRoute', () => {
  it('renders the BridgeStatusCard health strip alongside NetworkPanel', () => {
    render(<ActivityRoute />);

    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByText('Bridge Status Card')).toBeInTheDocument();
    expect(screen.getByText('Network Panel')).toBeInTheDocument();
  });
});
