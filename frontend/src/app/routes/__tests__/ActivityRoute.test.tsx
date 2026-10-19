import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../features/activity/ui/ActivityScreen/ActivityScreen', () => ({
  ActivityScreen: () => <div data-testid="activity-screen">Activity Screen</div>,
}));

import { ActivityRoute } from '../ActivityRoute';

describe('ActivityRoute', () => {
  it('renders the Activity heading above the Activity screen', () => {
    render(<ActivityRoute />);

    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByTestId('activity-screen')).toBeInTheDocument();
  });
});
