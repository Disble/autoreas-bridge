import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManualTriggerButton } from '../ManualTriggerButton';
import { useManualTriggerButton } from '../use-manual-trigger-button';

vi.mock('../use-manual-trigger-button', () => ({
  useManualTriggerButton: vi.fn(),
}));

/** The mocked hook each test sets to the view model the button renders. */
const mockedUseManualTriggerButton = vi.mocked(useManualTriggerButton);

describe('ManualTriggerButton', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an enabled trigger button in the "idle" status that calls trigger when pressed', () => {
    const trigger = vi.fn();
    mockedUseManualTriggerButton.mockReturnValue({ viewModel: { status: 'idle' }, trigger });

    render(<ManualTriggerButton />);

    expect(screen.getByRole('button', { name: /trigger download check now/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /trigger download check now/i }));

    expect(trigger).toHaveBeenCalled();
  });

  it('disables the button and shows a loading label while "triggering"', () => {
    mockedUseManualTriggerButton.mockReturnValue({ viewModel: { status: 'triggering' }, trigger: vi.fn() });

    render(<ManualTriggerButton />);

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText(/checking now/i)).toBeInTheDocument();
  });

  it('shows a success message when the status is "success"', () => {
    mockedUseManualTriggerButton.mockReturnValue({ viewModel: { status: 'success' }, trigger: vi.fn() });

    render(<ManualTriggerButton />);

    expect(screen.getByText(/download check started/i)).toBeInTheDocument();
  });

  it('shows an already-in-progress message when the status is "already-in-progress"', () => {
    mockedUseManualTriggerButton.mockReturnValue({ viewModel: { status: 'already-in-progress' }, trigger: vi.fn() });

    render(<ManualTriggerButton />);

    expect(screen.getByText(/already in progress/i)).toBeInTheDocument();
  });

  it('shows the error message with role="alert" when the status is "error"', () => {
    mockedUseManualTriggerButton.mockReturnValue({
      viewModel: { status: 'error', errorMessage: 'download scheduler unavailable' },
      trigger: vi.fn(),
    });

    render(<ManualTriggerButton />);

    expect(screen.getByRole('alert')).toHaveTextContent('download scheduler unavailable');
  });
});
