import { toast } from '@heroui/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { ActivityScreen } from '../ActivityScreen';

/** The source the screen reads: Now never resolves, the pin succeeds. */
const source: ActivitySource = {
  getNow: () => new Promise(() => undefined),
  pinMoment: vi.fn(() => Promise.resolve()),
  subscribeRecorder: () => () => undefined,
};

vi.mock('../../../activity-source/activity-source.helpers', () => ({
  createActivitySource: () => source,
}));

/** Renders the shell inside a router. */
function renderScreen() {
  render(
    <MemoryRouter>
      <ActivityScreen />
    </MemoryRouter>,
  );
}

describe('ActivityScreen', () => {
  it('opens on Now with the three tabs and the pin action', () => {
    renderScreen();

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Now', 'Incidents', 'History']);
    expect(screen.getByRole('tab', { name: 'Now' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status', { name: 'Loading activity' })).toBeInTheDocument();
  });

  it('shows the resting pane of a tab that has no view yet', () => {
    renderScreen();

    fireEvent.click(screen.getByRole('tab', { name: 'Incidents' }));
    expect(screen.getByRole('heading', { name: 'No incident selected' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading activity' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('heading', { name: 'No day selected' })).toBeInTheDocument();
  });

  it('pins the moment from the action beside the tabs', async () => {
    const success = vi.spyOn(toast, 'success').mockReturnValue('t');
    renderScreen();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pin this moment' })));

    expect(source.pinMoment).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledTimes(1);
  });
});
