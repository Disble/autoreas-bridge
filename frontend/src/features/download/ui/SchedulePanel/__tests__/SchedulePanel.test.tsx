import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchedulePanel } from '../SchedulePanel';
import { useSchedulePanel } from '../use-schedule-panel';
import type { SchedulePanelViewModel } from '../schedule-panel.types';

vi.mock('../use-schedule-panel', () => ({
  useSchedulePanel: vi.fn(),
}));

const mockedUseSchedulePanel = vi.mocked(useSchedulePanel);

const baseViewModel: SchedulePanelViewModel = {
  enabled: true,
  dailyTimeHHMM: '03:30',
  running: false,
  lastRunLabel: '1/1/2024, 12:00:00 AM',
  lastRunStatus: 'ok',
  nextRunLabel: '1/2/2024, 12:00:00 AM',
  enabledWeekdays: 127,
  selectedWeekdayValues: ['1', '2', '3', '4', '5', '6', '0'],
  willNeverRun: false,
  seasonModeActive: false,
};

type HookReturn = ReturnType<typeof useSchedulePanel>;

function mockHook(overrides: Partial<HookReturn> = {}): void {
  mockedUseSchedulePanel.mockReturnValue({
    status: 'ready',
    viewModel: baseViewModel,
    dailyTimeDraft: baseViewModel.dailyTimeHHMM,
    isSaving: false,
    saveErrorMessage: undefined,
    setEnabled: vi.fn(),
    setDailyTime: vi.fn(),
    setDailyTimeDraft: vi.fn(),
    commitDailyTime: vi.fn(),
    setWeekdays: vi.fn(),
    ...overrides,
  });
}

describe('SchedulePanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a loading skeleton while the status is "loading"', () => {
    mockHook({ status: 'loading' });

    render(<SchedulePanel />);

    expect(screen.getByLabelText('Loading schedule configuration')).toBeInTheDocument();
  });

  it('renders an error message when the status is "error"', () => {
    mockHook({ status: 'error' });

    render(<SchedulePanel />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders last/next run labels and status', () => {
    mockHook();

    render(<SchedulePanel />);

    expect(screen.getByText(baseViewModel.lastRunLabel)).toBeInTheDocument();
    expect(screen.getByText(baseViewModel.nextRunLabel)).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('shows a "Running now" indicator when running is true', () => {
    mockHook({ viewModel: { ...baseViewModel, running: true } });

    render(<SchedulePanel />);

    expect(screen.getByText(/running now/i)).toBeInTheDocument();
  });

  it('calls setEnabled when the enabled switch is toggled', () => {
    const setEnabled = vi.fn();
    mockHook({ setEnabled });

    render(<SchedulePanel />);

    fireEvent.click(screen.getByRole('switch', { name: /enable scheduled downloads/i }));

    expect(setEnabled).toHaveBeenCalledWith(false);
  });

  it('nests the switch control inside the clickable switch button so the toggle itself is pressable', () => {
    mockHook();

    const { container } = render(<SchedulePanel />);

    const content = container.querySelector('[data-slot="switch-content"]');
    const control = container.querySelector('[data-slot="switch-control"]');

    expect(content).not.toBeNull();
    expect(control).not.toBeNull();
    expect(content).toContainElement(control as HTMLElement);
  });

  it('updates the daily time draft while typing without saving immediately', () => {
    const setDailyTimeDraft = vi.fn();
    const setDailyTime = vi.fn();
    mockHook({ setDailyTime, setDailyTimeDraft });

    render(<SchedulePanel />);

    fireEvent.change(screen.getByLabelText(/daily run time/i), { target: { value: '05:00' } });

    expect(setDailyTimeDraft).toHaveBeenCalledWith('05:00');
    expect(setDailyTime).not.toHaveBeenCalled();
  });

  it('commits the daily time when the input loses focus', () => {
    const commitDailyTime = vi.fn();
    mockHook({ commitDailyTime });

    render(<SchedulePanel />);

    fireEvent.blur(screen.getByLabelText(/daily run time/i));

    expect(commitDailyTime).toHaveBeenCalledTimes(1);
  });

  it('renders a weekday toggle for each day', () => {
    mockHook();

    render(<SchedulePanel />);

    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('calls setWeekdays with the updated mask when a day is toggled off', () => {
    const setWeekdays = vi.fn();
    mockHook({ setWeekdays });

    render(<SchedulePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Sun' }));

    // Starting from all-days (127), deselecting Sunday (bit 0) yields 126.
    expect(setWeekdays).toHaveBeenCalledWith(126);
  });

  it('shows a warning when the schedule is enabled but no day is selected', () => {
    mockHook({ viewModel: { ...baseViewModel, willNeverRun: true, selectedWeekdayValues: [] } });

    render(<SchedulePanel />);

    expect(screen.getByText(/no days selected/i)).toBeInTheDocument();
  });

  it('shows a save error message when saveErrorMessage is set', () => {
    mockHook({ saveErrorMessage: 'save failed' });

    render(<SchedulePanel />);

    expect(screen.getByText('save failed')).toBeInTheDocument();
  });

  it('renders the season mode banner when seasonModeActive is true', () => {
    mockHook({ viewModel: { ...baseViewModel, seasonModeActive: true } });

    render(<SchedulePanel />);

    expect(screen.getByText('Season mode is on')).toBeInTheDocument();
    expect(
      screen.getByText('Each run downloads the "Ver hoy" set, regardless of the days selected below.'),
    ).toBeInTheDocument();
  });

  it('does NOT render the season mode banner when seasonModeActive is false', () => {
    mockHook({ viewModel: { ...baseViewModel, seasonModeActive: false } });

    render(<SchedulePanel />);

    expect(screen.queryByText('Season mode is on')).not.toBeInTheDocument();
  });

  it('still renders the weekday selector when seasonModeActive is true', () => {
    mockHook({ viewModel: { ...baseViewModel, seasonModeActive: true } });

    render(<SchedulePanel />);

    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('still renders the weekday selector when seasonModeActive is false', () => {
    mockHook({ viewModel: { ...baseViewModel, seasonModeActive: false } });

    render(<SchedulePanel />);

    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});
