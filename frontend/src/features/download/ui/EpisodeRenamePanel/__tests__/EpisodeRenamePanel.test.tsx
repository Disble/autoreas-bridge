import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EpisodeRenamePanel } from '../EpisodeRenamePanel';
import { useEpisodeRenamePanel } from '../use-episode-rename-panel';

vi.mock('../use-episode-rename-panel', () => ({
  useEpisodeRenamePanel: vi.fn(),
}));

/** Typed handle onto the mocked hook so overrides get hook-return type checking. */
const mockedHook = vi.mocked(useEpisodeRenamePanel);
/** Shape of the hook's return value, reused to type mock overrides. */
type HookReturn = ReturnType<typeof useEpisodeRenamePanel>;

/** Builds a ready hook state each case overrides one field of, and applies it to the mock. */
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

    expect(screen.getByRole('status', { name: 'Loading episode rename setting' })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('reflects an enabled preference in the switch and persists the opt-out', () => {
    const value = mockHook({ enabled: true });

    render(<EpisodeRenamePanel />);
    expect(screen.getByRole('switch')).toBeChecked();
    fireEvent.click(screen.getByRole('switch'));

    expect(value.setEnabled).toHaveBeenCalledWith(false);
  });

  // Users need to know this only affects future downloads before they turn it
  // on, not after it has already skipped their existing library.
  it('renders a disabled preference with its layout and note, no alert, and persists the opt-in', () => {
    const value = mockHook({ enabled: false });

    const { container } = render(<EpisodeRenamePanel />);

    expect(container.querySelector('section')).toHaveClass('flex', 'flex-col', 'gap-3');
    expect(screen.getByText(/Only newly downloaded episodes are renamed/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));

    expect(value.setEnabled).toHaveBeenCalledWith(true);
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

  it('applies the caller-provided className to the section', () => {
    mockHook();

    const { container } = render(<EpisodeRenamePanel className="custom-panel" />);

    expect(container.querySelector('section')).toHaveClass('custom-panel', 'flex');
  });
});
