import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/** Stands in for the status hook so this suite asserts rendering only. */
const useBridgeStatusCardMock = vi.fn();

vi.mock('../use-bridge-status-card', () => ({
  useBridgeStatusCard: () => useBridgeStatusCardMock(),
}));

import { BridgeStatusCard } from '../BridgeStatusCard';

describe('BridgeStatusCard loading state', () => {
  it('announces the load and shows a chip-shaped placeholder while the status is unresolved', () => {
    useBridgeStatusCardMock.mockReturnValue({ isLoading: true, sqliteStatus: '', statusTone: 'default' });

    render(<BridgeStatusCard />);

    expect(screen.getByRole('status', { name: 'Loading SQLite status...' })).toBeInTheDocument();
    expect(screen.getByTestId('bridge-status-skeleton')).toBeInTheDocument();
  });

  it('drops the placeholder and its status region once the status resolves', () => {
    useBridgeStatusCardMock.mockReturnValue({ isLoading: false, sqliteStatus: 'connected', statusTone: 'success' });

    render(<BridgeStatusCard />);

    expect(screen.getByText('connected')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('bridge-status-skeleton')).toBeNull();
  });
});
