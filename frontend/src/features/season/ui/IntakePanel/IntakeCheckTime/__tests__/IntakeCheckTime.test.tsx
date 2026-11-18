import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModuleReadiness } from '../../../../../../shared/contracts/readiness.types';
import { createBridgeError } from '../../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../../shared/query/test-support/bridge-modules.test-support';
import { IntakeCheckTime } from '../IntakeCheckTime';
import { CHECK_TIME_LOAD_FAILED_TITLE, CHECK_TIME_LOADING_LABEL } from '../intake-check-time.constants';
import type { CheckTimePort } from '../intake-check-time.types';

/**
 * Builds a fake settings port for the check time.
 * @returns The port's spies; the stored time is 21:00 and every save resolves.
 */
function fakePort() {
  return {
    getSeasonCheckTime: vi.fn<CheckTimePort['getSeasonCheckTime']>().mockResolvedValue('21:00'),
    setSeasonCheckTime: vi.fn<CheckTimePort['setSeasonCheckTime']>().mockResolvedValue(undefined),
  };
}

/**
 * Mounts the control over a fake port and a settings module in the given state.
 * @param port The fake port.
 * @param settings The settings module's readiness.
 * @returns The render result.
 */
function renderWith(port: CheckTimePort, settings: Omit<ModuleReadiness, 'module'> = { state: 'ready' }) {
  return render(<IntakeCheckTime source={port} />, { wrapper: createModulesTestWrapper({ module: 'settings', ...settings }).wrapper });
}

/**
 * Mounts the control over a ready settings module and waits for its trigger.
 * @returns The port's spies.
 */
async function renderControl() {
  const port = fakePort();
  renderWith(port);
  await screen.findByRole('button', { name: 'Daily check 21:00' });
  return port;
}

describe('IntakeCheckTime', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows a labelled skeleton of the control, and no trigger, while the settings module starts', async () => {
    const port = fakePort();
    renderWith(port, { state: 'starting' });

    expect(await screen.findByRole('status', { name: CHECK_TIME_LOADING_LABEL })).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(port.getSeasonCheckTime).not.toHaveBeenCalled();
  });

  it('shows the read failure with the bridge message instead of the trigger or the skeleton', async () => {
    const port = fakePort();
    port.getSeasonCheckTime.mockRejectedValue(createBridgeError('internal', 'read settings: disk I/O error'));
    renderWith(port);

    expect(await screen.findByText('read settings: disk I/O error')).toBeInTheDocument();
    expect(screen.getByText(CHECK_TIME_LOAD_FAILED_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a failed settings module as the failure state', async () => {
    renderWith(fakePort(), { state: 'failed', reason: 'settings store corrupt' });

    expect(await screen.findByText(CHECK_TIME_LOAD_FAILED_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens a popover with the labelled time field and its hint', async () => {
    await renderControl();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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

    await waitFor(() => expect(port.setSeasonCheckTime).toHaveBeenCalledWith('21:00'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the popover open when a save is rejected', async () => {
    const port = await renderControl();
    port.setSeasonCheckTime.mockRejectedValue(createBridgeError('unavailable', 'settings is starting'));
    fireEvent.click(screen.getByRole('button', { name: 'Daily check 21:00' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(port.setSeasonCheckTime).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Cancel without saving', async () => {
    const port = await renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Daily check 21:00' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(port.setSeasonCheckTime).not.toHaveBeenCalled();
  });
});
