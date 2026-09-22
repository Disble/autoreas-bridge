import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../features/dashboard/ui/BridgeStatusCard/BridgeStatusCard', () => ({
  BridgeStatusCard: () => <div>Bridge Status Card</div>,
}));
vi.mock('../../../features/network/ui/ActivityView/ActivityView', () => ({
  ActivityView: ({ statusStrip }: { statusStrip?: ReactNode }) => (
    <div data-testid="activity-view">Activity View{statusStrip}</div>
  ),
}));

import { ActivityRoute } from '../ActivityRoute';

describe('ActivityRoute', () => {
  it('composes the bridge status strip INTO the Activity view instead of rendering it as a strip above the tabs', () => {
    render(<ActivityRoute />);

    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
    // The card travels as the opaque statusStrip element: it renders inside
    // the view (which mounts it in the Overview tab) and exactly once — it is
    // no longer a sibling strip above the tabbed content.
    const view = screen.getByTestId('activity-view');
    expect(within(view).getByText('Bridge Status Card')).toBeInTheDocument();
    expect(screen.getAllByText('Bridge Status Card')).toHaveLength(1);
  });
});
