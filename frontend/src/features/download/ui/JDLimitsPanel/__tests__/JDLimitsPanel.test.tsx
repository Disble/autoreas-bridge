import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JDLimitsPanel } from '../JDLimitsPanel';
import { useJDLimitsPanel } from '../use-jdlimits-panel';

vi.mock('../use-jdlimits-panel', () => ({
  useJDLimitsPanel: vi.fn(),
}));

const mockedHook = vi.mocked(useJDLimitsPanel);
type HookReturn = ReturnType<typeof useJDLimitsPanel>;

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    status: 'ready',
    maxSimultaneousDownloads: 3,
    isAvailable: true,
    isRefreshing: false,
    errorMessage: undefined,
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  mockedHook.mockReturnValue(value);
  return value;
}

afterEach(cleanup);

describe('JDLimitsPanel', () => {
  it('renders a skeleton while the setting loads', () => {
    mockHook({ status: 'loading' });

    render(<JDLimitsPanel />);

    expect(screen.getByLabelText('Loading JDownloader download limit')).toBeInTheDocument();
  });

  it('shows the configured limit', () => {
    mockHook({ maxSimultaneousDownloads: 3 });

    render(<JDLimitsPanel />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // An unreadable setting must not render as "0": that reads as a real limit and would
  // suggest JDownloader downloads nothing.
  it('says the limit is unavailable instead of showing zero', () => {
    mockHook({ maxSimultaneousDownloads: 0, isAvailable: false });

    render(<JDLimitsPanel />);

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('surfaces a read failure', () => {
    mockHook({ status: 'error', errorMessage: 'cfg unreadable' });

    render(<JDLimitsPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('cfg unreadable');
  });

  it('re-reads the setting when refresh is pressed', () => {
    const value = mockHook();

    render(<JDLimitsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(value.refresh).toHaveBeenCalled();
  });

  it('disables refresh while a read is in flight', () => {
    mockHook({ isRefreshing: true });

    render(<JDLimitsPanel />);

    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
  });

  // The panel is deliberately read-only: writing the setting needs the MyJDownloader
  // /config API, which the client does not implement yet.
  it('offers no control that edits the setting', () => {
    mockHook();

    render(<JDLimitsPanel />);

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
