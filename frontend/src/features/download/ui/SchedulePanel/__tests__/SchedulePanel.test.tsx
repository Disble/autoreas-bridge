import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchedulePanel } from '../SchedulePanel';
import { useSchedulePanel } from '../use-schedule-panel';
import type { SchedulePanelViewModel } from '../schedule-panel.types';

vi.mock('../use-schedule-panel', () => ({
  useSchedulePanel: vi.fn(),
}));

/** Typed handle onto the mocked hook so overrides get hook-return type checking. */
const mockedUseSchedulePanel = vi.mocked(useSchedulePanel);

/** Same view model, but with the optional readiness field made required so the baseline must set it explicitly. */
type TestSchedulePanelViewModel = SchedulePanelViewModel & {
  readonly readiness: SchedulePanelViewModel['readiness'];
};

/** Baseline ready schedule view model each case overrides one field of. */
const baseViewModel: TestSchedulePanelViewModel = {
  enabled: true,
  dailyTimeHHMM: '03:30',
  running: false,
  lastRunLabel: '1/1/2024, 12:00:00 AM',
  lastRunStatus: 'ok',
  nextRunLabel: '1/2/2024, 12:00:00 AM',
  enabledWeekdays: 127,
  selectedWeekdayValues: ['1', '2', '3', '4', '5', '6', '0'],
  willNeverRun: false,
  isScheduledToday: true,
  seasonModeActive: false,
  missedNotice: undefined,
  readiness: undefined,
};

/** Shape of the hook's return value, reused to type mock overrides. */
type HookReturn = ReturnType<typeof useSchedulePanel>;

/** Configures the mocked hook with a ready default state, merging in each case's overrides. */
function mockHook(overrides: Partial<HookReturn> = {}): void {
  const defaults: HookReturn = {
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
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    isResolvingMissedAction: false,
    missedActionMessage: undefined,
    readinessErrorMessage: undefined,
    refreshReadiness: vi.fn(),
  };

  mockedUseSchedulePanel.mockReturnValue({
    ...defaults,
    ...overrides,
    viewModel: overrides.viewModel ?? defaults.viewModel,
  });
}

describe('SchedulePanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a loading skeleton while the status is "loading"', () => {
    mockHook({ status: 'loading' });

    render(<SchedulePanel />);

    expect(screen.getByRole('status', { name: 'Loading schedule configuration' })).toBeInTheDocument();
  });

  it('renders an error message when the status is "error"', () => {
    mockHook({ status: 'error' });

    render(<SchedulePanel />);

    expect(screen.getByText('Schedule unavailable')).toBeInTheDocument();
  });

  it('shows a "Running now" indicator when running is true', () => {
    mockHook({ viewModel: { ...baseViewModel, running: true } });

    render(<SchedulePanel />);

    expect(screen.getByText(/running now/i)).toBeInTheDocument();
  });

  it('renders the ready schedule and forwards each edit to the hook', () => {
    const catchHandler = vi.fn();
    const setEnabled = vi.fn().mockReturnValue({ catch: catchHandler });
    const commitDailyTime = vi.fn().mockReturnValue({ catch: catchHandler });
    const setWeekdays = vi.fn().mockReturnValue({ catch: catchHandler });
    const setDailyTimeDraft = vi.fn();
    const setDailyTime = vi.fn();
    mockHook({ setEnabled, commitDailyTime, setWeekdays, setDailyTimeDraft, setDailyTime });

    const { container } = render(<SchedulePanel />);

    expect(screen.getByText(baseViewModel.lastRunLabel)).toBeInTheDocument();
    expect(screen.getByText(baseViewModel.nextRunLabel)).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(screen.queryByText('Season mode is on')).not.toBeInTheDocument();
    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    const content = container.querySelector('[data-slot="switch-content"]');
    const control = container.querySelector('[data-slot="switch-control"]');
    expect(content).not.toBeNull();
    expect(control).not.toBeNull();
    expect(content).toContainElement(control as HTMLElement);

    fireEvent.click(screen.getByRole('switch', { name: /enable scheduled downloads/i }));
    expect(setEnabled).toHaveBeenCalledWith(false);
    expect(catchHandler).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText(/daily run time/i), { target: { value: '05:00' } });
    expect(setDailyTimeDraft).toHaveBeenCalledWith('05:00');
    expect(setDailyTime).not.toHaveBeenCalled();

    fireEvent.blur(screen.getByLabelText(/daily run time/i));
    expect(commitDailyTime).toHaveBeenCalledTimes(1);
    expect(catchHandler).toHaveBeenCalledTimes(2);

    // Starting from all-days (127), deselecting Sunday (bit 0) yields 126.
    fireEvent.click(screen.getByRole('button', { name: 'Sun' }));
    expect(setWeekdays).toHaveBeenCalledWith(126);
    expect(catchHandler).toHaveBeenCalledTimes(3);
  });

  it('shows a warning when the schedule is enabled but no day is selected', () => {
    mockHook({ viewModel: { ...baseViewModel, willNeverRun: true, selectedWeekdayValues: [] } });

    render(<SchedulePanel />);

    expect(screen.getByText(/no days selected/i)).toBeInTheDocument();
  });

  it('shows named blockers before a scheduled download run', () => {
    mockHook({
      viewModel: {
        ...baseViewModel,
        readiness: {
          scheduledTotal: 2,
          scheduledReady: 1,
          scheduledBlocked: 1,
          blockedAnime: [{ name: 'Blocked Anime', reasonLabels: ['This source is not supported for downloads.'] }],
        },
      },
    });

    render(<SchedulePanel />);

    expect(screen.getByText('Scheduled anime need attention')).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 scheduled anime are ready/i)).toBeInTheDocument();
    expect(screen.getByText(/blocked anime.*this source is not supported/i)).toBeInTheDocument();
  });

  it('hides scheduled blockers when today is not a selected download day', () => {
    mockHook({
      viewModel: {
        ...baseViewModel,
        isScheduledToday: false,
        readiness: {
          scheduledTotal: 2,
          scheduledReady: 1,
          scheduledBlocked: 1,
          blockedAnime: [{ name: 'Blocked Anime', reasonLabels: ['This source is not supported for downloads.'] }],
        },
      },
    });

    render(<SchedulePanel />);

    expect(screen.queryByText('Scheduled anime need attention')).not.toBeInTheDocument();
  });

  it('shows a retryable readiness error', () => {
    const refreshReadiness = vi.fn().mockReturnValue({ catch: vi.fn() });
    mockHook({ readinessErrorMessage: 'readiness unavailable', refreshReadiness });

    render(<SchedulePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByText('readiness unavailable')).toBeInTheDocument();
    expect(refreshReadiness).toHaveBeenCalledTimes(1);
  });

  it('renders the missed selected-day notice and forwards Run now and Ignore', () => {
    const runMissedScheduleNow = vi.fn().mockReturnValue({ catch: vi.fn() });
    const ignoreMissedSchedule = vi.fn().mockReturnValue({ catch: vi.fn() });
    mockHook({
      runMissedScheduleNow,
      ignoreMissedSchedule,
      viewModel: {
        ...baseViewModel,
        missedNotice: { localDate: '2026-07-26', dueLabel: '7/26/2026, 9:00:00 PM', attemptStatus: 'partial' },
      },
    });

    render(<SchedulePanel />);

    expect(screen.getByText(/missed selected day/i)).toBeInTheDocument();
    expect(screen.getByText(/partial/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    expect(runMissedScheduleNow).toHaveBeenCalledWith('2026-07-26');

    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));
    expect(ignoreMissedSchedule).toHaveBeenCalledWith('2026-07-26');
  });

  it('renders a missed-action message when the hook reports one', () => {
    mockHook({
      missedActionMessage: 'Run now finished with partial. The notice remains active.',
      viewModel: { ...baseViewModel, missedNotice: { localDate: '2026-07-26', dueLabel: '7/26/2026, 9:00:00 PM', attemptStatus: 'partial' } },
    });

    render(<SchedulePanel />);

    expect(screen.getByText('Run now finished with partial. The notice remains active.')).toBeInTheDocument();
  });

  it('shows a save error message when saveErrorMessage is set', () => {
    mockHook({ saveErrorMessage: 'save failed' });

    render(<SchedulePanel />);

    expect(screen.getByText('save failed')).toBeInTheDocument();
  });

  it('renders the season mode banner and still the weekday selector when seasonModeActive is true', () => {
    mockHook({ viewModel: { ...baseViewModel, seasonModeActive: true } });

    render(<SchedulePanel />);

    expect(screen.getByText('Season mode is on')).toBeInTheDocument();
    expect(
      screen.getByText('Each run downloads the "Ver hoy" set, regardless of the days selected below.'),
    ).toBeInTheDocument();
    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});
