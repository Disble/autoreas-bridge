import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EpisodeRenamePanel } from '../EpisodeRenamePanel';
import { useEpisodeRenamePanel } from '../use-episode-rename-panel';

vi.mock('../use-episode-rename-panel', () => ({
  useEpisodeRenamePanel: vi.fn(),
}));

const mockedHook = vi.mocked(useEpisodeRenamePanel);
type HookReturn = ReturnType<typeof useEpisodeRenamePanel>;

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    status: 'ready',
    enabled: false,
    isSaving: false,
    errorMessage: undefined,
    setEnabled: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  mockedHook.mockReturnValue(value);
  return value;
}

afterEach(cleanup);

describe('EpisodeRenamePanel', () => {
  it('renders a skeleton while the preference loads', () => {
    mockHook({ status: 'loading' });

    render(<EpisodeRenamePanel />);

    expect(screen.getByLabelText('Loading episode rename setting')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('reflects the persisted preference in the switch', () => {
    mockHook({ enabled: true });

    render(<EpisodeRenamePanel />);

    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('persists the opt-in when the switch is turned on', () => {
    const value = mockHook({ enabled: false });

    render(<EpisodeRenamePanel />);
    fireEvent.click(screen.getByRole('switch'));

    expect(value.setEnabled).toHaveBeenCalledWith(true);
  });

  it('persists the opt-out when the switch is turned off', () => {
    const value = mockHook({ enabled: true });

    render(<EpisodeRenamePanel />);
    fireEvent.click(screen.getByRole('switch'));

    expect(value.setEnabled).toHaveBeenCalledWith(false);
  });

  it('disables the switch while the preference is being saved', () => {
    mockHook({ isSaving: true });

    render(<EpisodeRenamePanel />);

    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('surfaces a save failure without hiding the switch', () => {
    mockHook({ errorMessage: 'settings store unavailable' });

    render(<EpisodeRenamePanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('settings store unavailable');
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('shows no alert while nothing has failed', () => {
    mockHook({ errorMessage: undefined });

    render(<EpisodeRenamePanel />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies the caller-provided className to the section', () => {
    mockHook();

    const { container } = render(<EpisodeRenamePanel className="custom-panel" />);

    expect(container.querySelector('section')).toHaveClass('custom-panel', 'flex');
  });

  it('keeps its own layout classes when no className is provided', () => {
    mockHook();

    const { container } = render(<EpisodeRenamePanel />);

    expect(container.querySelector('section')).toHaveClass('flex', 'flex-col', 'gap-3');
  });

  // Users need to know this only affects future downloads before they turn it
  // on, not after it has already skipped their existing library.
  it('states that only newly downloaded episodes are renamed', () => {
    mockHook();

    render(<EpisodeRenamePanel />);

    expect(screen.getByText(/Only newly downloaded episodes are renamed/)).toBeInTheDocument();
  });
});
