import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../features/activity/ui/ActivityScreen/ActivityScreen', () => ({
  ActivityScreen: () => <div data-testid="activity-screen">Activity Screen</div>,
}));

import { ActivityRoute } from '../ActivityRoute';

describe('ActivityRoute', () => {
  it('renders the Activity screen, which owns its own header', () => {
    render(<ActivityRoute />);

    expect(screen.getByTestId('activity-screen')).toBeInTheDocument();
  });
});
