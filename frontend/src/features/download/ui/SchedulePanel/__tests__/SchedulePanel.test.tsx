import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchedulePanel } from '../SchedulePanel';
import { useSchedulePanel } from '../use-schedule-panel';

vi.mock('../use-schedule-panel', () => ({
  useSchedulePanel: vi.fn(),
}));

const mockedUseSchedulePanel = vi.mocked(useSchedulePanel);

const baseViewModel = {
  enabled: true,
  dailyTimeHHMM: '03:30',
  running: false,
  lastRunLabel: '1/1/2024, 12:00:00 AM',
  lastRunStatus: 'ok',
  nextRunLabel: '1/2/2024, 12:00:00 AM',
};

describe('SchedulePanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a loading skeleton while the status is "loading"', () => {
    mockedUseSchedulePanel.mockReturnValue({
      status: 'loading',
      viewModel: baseViewModel,
      isSaving: false,
      saveErrorMessage: undefined,
      setEnabled: vi.fn(),
      setDailyTime: vi.fn(),
    });

    render(<SchedulePanel />);

    expect(screen.getByLabelText('Loading schedule configuration')).toBeInTheDocument();
  });

  it('renders an error message when the status is "error"', () => {
    mockedUseSchedulePanel.mockReturnValue({
      status: 'error',
      viewModel: baseViewModel,
      isSaving: false,
      saveErrorMessage: undefined,
      setEnabled: vi.fn(),
      setDailyTime: vi.fn(),
    });

    render(<SchedulePanel />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders last/next run labels and status', () => {
    mockedUseSchedulePanel.mockReturnValue({
      status: 'ready',
      viewModel: baseViewModel,
      isSaving: false,
      saveErrorMessage: undefined,
      setEnabled: vi.fn(),
      setDailyTime: vi.fn(),
    });

    render(<SchedulePanel />);

    expect(screen.getByText(baseViewModel.lastRunLabel)).toBeInTheDocument();
    expect(screen.getByText(baseViewModel.nextRunLabel)).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('shows a "Running now" indicator when running is true', () => {
    mockedUseSchedulePanel.mockReturnValue({
      status: 'ready',
      viewModel: { ...baseViewModel, running: true },
      isSaving: false,
      saveErrorMessage: undefined,
      setEnabled: vi.fn(),
      setDailyTime: vi.fn(),
    });

    render(<SchedulePanel />);

    expect(screen.getByText(/running now/i)).toBeInTheDocument();
  });

  it('calls setEnabled when the enabled switch is toggled', () => {
    const setEnabled = vi.fn();
    mockedUseSchedulePanel.mockReturnValue({
      status: 'ready',
      viewModel: baseViewModel,
      isSaving: false,
      saveErrorMessage: undefined,
      setEnabled,
      setDailyTime: vi.fn(),
    });

    render(<SchedulePanel />);

    fireEvent.click(screen.getByRole('switch', { name: /enable scheduled downloads/i }));

    expect(setEnabled).toHaveBeenCalledWith(false);
  });

  it('calls setDailyTime when the time input changes', () => {
    const setDailyTime = vi.fn();
    mockedUseSchedulePanel.mockReturnValue({
      status: 'ready',
      viewModel: baseViewModel,
      isSaving: false,
      saveErrorMessage: undefined,
      setEnabled: vi.fn(),
      setDailyTime,
    });

    render(<SchedulePanel />);

    fireEvent.change(screen.getByLabelText(/daily run time/i), { target: { value: '05:00' } });

    expect(setDailyTime).toHaveBeenCalledWith('05:00');
  });

  it('shows a save error message when saveErrorMessage is set', () => {
    mockedUseSchedulePanel.mockReturnValue({
      status: 'ready',
      viewModel: baseViewModel,
      isSaving: false,
      saveErrorMessage: 'save failed',
      setEnabled: vi.fn(),
      setDailyTime: vi.fn(),
    });

    render(<SchedulePanel />);

    expect(screen.getByText('save failed')).toBeInTheDocument();
  });
});
