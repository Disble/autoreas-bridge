import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AutoStartPanel } from '../AutoStartPanel';

describe('AutoStartPanel', () => {
  it('renders the login-launch control', () => {
    render(<AutoStartPanel source={{ getAutoStartEnabled: vi.fn().mockResolvedValue(true), setAutoStartEnabled: vi.fn() }} />);

    expect(screen.getByText('Launch Autoreas Bridge when I sign in to Windows')).toBeInTheDocument();
    expect(screen.getByText('Bridge starts hidden and stays available from the system tray.')).toBeInTheDocument();
  });
});
