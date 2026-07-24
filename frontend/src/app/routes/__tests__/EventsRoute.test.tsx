import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../features/network/ui/NetworkPanel/NetworkPanel', () => ({
  NetworkPanel: () => <div>Network Panel</div>,
}));

import { EventsRoute } from '../EventsRoute';

describe('EventsRoute', () => {
  it('renders the unchanged event log NetworkPanel', () => {
    render(<EventsRoute />);

    expect(screen.getByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument();
    expect(screen.getByText('Network Panel')).toBeInTheDocument();
  });
});
