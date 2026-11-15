import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { AutoStartPanel } from '../AutoStartPanel';
import { AUTO_START_LOADING_LABEL, AUTO_START_UNAVAILABLE_TITLE } from '../auto-start-panel.constants';
import type { AutoStartSource } from '../auto-start-panel.types';

/**
 * Renders the panel under a query wrapper whose `settings` module is `state`.
 * @param source The Settings port.
 * @param state The settings module's state.
 * @returns The render result.
 */
function renderPanel(source: AutoStartSource, state: 'starting' | 'ready' = 'ready') {
  const { wrapper } = createModulesTestWrapper(status('settings', state));
  return render(<AutoStartPanel source={source} />, { wrapper });
}

describe('AutoStartPanel', () => {
  it('renders the login-launch control with the stored preference', async () => {
    renderPanel({ getAutoStartEnabled: vi.fn().mockResolvedValue(true), setAutoStartEnabled: vi.fn() });

    expect(await screen.findByRole('switch', { name: 'Launch Autoreas Bridge when I sign in to Windows' })).toBeChecked();
    expect(screen.getByText('Bridge starts hidden and stays available from the system tray.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a labelled skeleton and no switch while the settings module starts', () => {
    renderPanel({ getAutoStartEnabled: vi.fn().mockResolvedValue(true), setAutoStartEnabled: vi.fn() }, 'starting');

    expect(screen.getByRole('status', { name: AUTO_START_LOADING_LABEL })).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('shows the read failure instead of a default switch', async () => {
    renderPanel({ getAutoStartEnabled: vi.fn().mockRejectedValue(createBridgeError('internal', 'settings disk I/O error')), setAutoStartEnabled: vi.fn() });

    expect(await screen.findByText(AUTO_START_UNAVAILABLE_TITLE)).toBeInTheDocument();
    expect(screen.getByText('settings disk I/O error')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
