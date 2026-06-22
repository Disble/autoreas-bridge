import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JDConfigPanel } from '../JDConfigPanel';
import { useJDConfigPanel } from '../use-jdconfig-panel';

vi.mock('../use-jdconfig-panel', () => ({
  useJDConfigPanel: vi.fn(),
}));

const mockedUseJDConfigPanel = vi.mocked(useJDConfigPanel);

const baseForm = {
  email: 'user@example.com',
  plaintextPassword: '',
  deviceName: 'desktop-1',
  exePathOverride: '',
  defaultDestDir: 'D:/downloads',
};

const baseLiveStatus = {
  email: 'user@example.com',
  hasPassword: true,
  deviceName: 'desktop-1',
  exePathOverride: '',
  defaultDestDir: 'D:/downloads',
  lastSeenStatus: 'online',
  lastSeenAtMs: 1_700_000_000_000,
};

describe('JDConfigPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a loading skeleton while the status is "loading"', () => {
    mockedUseJDConfigPanel.mockReturnValue({
      status: 'loading',
      form: baseForm,
      liveStatus: baseLiveStatus,
      isSaving: false,
      saveErrorMessage: undefined,
      saveSucceeded: false,
      updateField: vi.fn(),
      save: vi.fn(),
    });

    render(<JDConfigPanel />);

    expect(screen.getByLabelText('Loading JD account configuration')).toBeInTheDocument();
  });

  it('renders an error message when the status is "error"', () => {
    mockedUseJDConfigPanel.mockReturnValue({
      status: 'error',
      form: baseForm,
      liveStatus: baseLiveStatus,
      isSaving: false,
      saveErrorMessage: undefined,
      saveSucceeded: false,
      updateField: vi.fn(),
      save: vi.fn(),
    });

    render(<JDConfigPanel />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the password field empty even though hasPassword is true (write-only contract)', () => {
    mockedUseJDConfigPanel.mockReturnValue({
      status: 'ready',
      form: baseForm,
      liveStatus: baseLiveStatus,
      isSaving: false,
      saveErrorMessage: undefined,
      saveSucceeded: false,
      updateField: vi.fn(),
      save: vi.fn(),
    });

    render(<JDConfigPanel />);

    const passwordField = screen.getByLabelText(/password/i) as HTMLInputElement;
    expect(passwordField.value).toBe('');
    expect(passwordField.type).toBe('password');
  });

  it('shows a live status chip reflecting lastSeenStatus', () => {
    mockedUseJDConfigPanel.mockReturnValue({
      status: 'ready',
      form: baseForm,
      liveStatus: baseLiveStatus,
      isSaving: false,
      saveErrorMessage: undefined,
      saveSucceeded: false,
      updateField: vi.fn(),
      save: vi.fn(),
    });

    render(<JDConfigPanel />);

    expect(screen.getByText(/online/i)).toBeInTheDocument();
  });

  it('calls updateField when the email input changes', () => {
    const updateField = vi.fn();
    mockedUseJDConfigPanel.mockReturnValue({
      status: 'ready',
      form: baseForm,
      liveStatus: baseLiveStatus,
      isSaving: false,
      saveErrorMessage: undefined,
      saveSucceeded: false,
      updateField,
      save: vi.fn(),
    });

    render(<JDConfigPanel />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'next@example.com' } });

    expect(updateField).toHaveBeenCalledWith('email', 'next@example.com');
  });

  it('calls save when the form is submitted', () => {
    const save = vi.fn();
    mockedUseJDConfigPanel.mockReturnValue({
      status: 'ready',
      form: baseForm,
      liveStatus: baseLiveStatus,
      isSaving: false,
      saveErrorMessage: undefined,
      saveSucceeded: false,
      updateField: vi.fn(),
      save,
    });

    render(<JDConfigPanel />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('shows a save error message when saveErrorMessage is set', () => {
    mockedUseJDConfigPanel.mockReturnValue({
      status: 'ready',
      form: baseForm,
      liveStatus: baseLiveStatus,
      isSaving: false,
      saveErrorMessage: 'save failed',
      saveSucceeded: false,
      updateField: vi.fn(),
      save: vi.fn(),
    });

    render(<JDConfigPanel />);

    expect(screen.getByText('save failed')).toBeInTheDocument();
  });
});
