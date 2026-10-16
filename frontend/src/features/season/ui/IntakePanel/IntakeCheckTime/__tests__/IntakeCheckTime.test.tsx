import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IntakeCheckTime } from '../IntakeCheckTime';
import type { CheckTimePort } from '../intake-check-time.types';

/**
 * Mounts the control over a fake port and waits for its trigger.
 * @param saveStatus The status every save resolves with.
 * @returns The port's spies.
 */
async function renderControl(saveStatus = 'ok') {
  const port = {
    getCheckTime: vi.fn<CheckTimePort['getCheckTime']>().mockResolvedValue('21:00'),
    setCheckTime: vi.fn<CheckTimePort['setCheckTime']>().mockResolvedValue(saveStatus),
  };
  render(<IntakeCheckTime source={port} />);
  await screen.findByRole('button', { name: 'Daily check 21:00' });
  return port;
}

describe('IntakeCheckTime', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing while the check time is unknown', async () => {
    const getCheckTime = vi.fn<CheckTimePort['getCheckTime']>().mockResolvedValue('');
    const { container } = render(<IntakeCheckTime source={{ getCheckTime, setCheckTime: vi.fn() }} />);
    await waitFor(() => expect(getCheckTime).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('opens a popover with the labelled time field and its hint', async () => {
    await renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Daily check 21:00' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Daily availability check' }).length).toBeGreaterThan(0);
    const [hour, minute] = screen.getAllByRole('spinbutton');
    expect(hour).toHaveAttribute('aria-valuenow', '21');
    expect(minute).toHaveAttribute('aria-valuenow', '0');
    expect(hour).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Runs every day while a season is open.')).toBeInTheDocument();
  });

  it('saves the shown time and closes', async () => {
    const port = await renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Daily check 21:00' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(port.setCheckTime).toHaveBeenCalledWith('21:00'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the popover open and shows why a save failed', async () => {
    await renderControl('settings store unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Daily check 21:00' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText('settings store unavailable')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')[0]).toHaveAttribute('aria-invalid', 'true');
  });

  it('closes on Cancel without saving', async () => {
    const port = await renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Daily check 21:00' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(port.setCheckTime).not.toHaveBeenCalled();
  });
});
