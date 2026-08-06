import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunHistoryPanel } from '../RunHistoryPanel';
import { useRunHistoryPanel } from '../use-run-history-panel';

vi.mock('../use-run-history-panel', () => ({
  useRunHistoryPanel: vi.fn(),
}));

const mockedUseRunHistoryPanel = vi.mocked(useRunHistoryPanel);

const rows = [
  {
    runId: 'run-1',
    startedLabel: '1/1/2024, 12:00:00 AM',
    statusLabel: 'ok',
    trigger: 'manual',
    episodesDownloaded: 3,
    episodesFailed: 0,
    isSelected: true,
  },
  {
    runId: 'run-2',
    startedLabel: '1/2/2024, 12:00:00 AM',
    statusLabel: 'jd_offline',
    trigger: 'scheduled',
    episodesDownloaded: 0,
    episodesFailed: 0,
    isSelected: false,
  },
];

const jdOfflineRun = {
  runId: 'run-2',
  startedAtMs: 1_700_086_400_000,
  finishedAtMs: 1_700_086_500_000,
  trigger: 'scheduled',
  animesChecked: 5,
  episodesFound: 2,
  episodesDownloaded: 0,
  episodesFailed: 0,
  episodesDownloading: 2,
  skippedCount: 0,
  upToDateCount: 0,
  jdAvailable: false,
  status: 'jd_offline',
  manualLinks: [{ anime: 'Frieren', episode: 12, links: ['https://example.com/a'] }],
};

const okRun = {
  runId: 'run-1',
  startedAtMs: 1_700_000_000_000,
  finishedAtMs: 1_700_000_100_000,
  trigger: 'manual',
  animesChecked: 3,
  episodesFound: 1,
  episodesDownloaded: 1,
  episodesFailed: 0,
  episodesDownloading: 0,
  skippedCount: 0,
  upToDateCount: 2,
  jdAvailable: true,
  status: 'ok',
};

describe('RunHistoryPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a loading skeleton while the status is "loading"', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'loading', rows: [], visibleRows: [], canLoadMore: false, remainingCount: 0, runInProgress: false, isStopping: false },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByLabelText('Loading download run history')).toBeInTheDocument();
  });

  it('renders an empty state when there are no runs', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'empty', rows: [], visibleRows: [], canLoadMore: false, remainingCount: 0, runInProgress: false, isStopping: false },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByText(/no download runs yet/i)).toBeInTheDocument();
  });

  it('renders an error message when the status is "error"', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'error', rows: [], visibleRows: [], canLoadMore: false, remainingCount: 0, runInProgress: false, isStopping: false, errorMessage: 'network down' },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('network down');
  });

  it('renders every run as a selectable master-list row', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows, visibleRows: rows, canLoadMore: false, remainingCount: 0, runInProgress: false, isStopping: false },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByRole('button', { name: /1\/1\/2024.*ok/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\/2\/2024.*jd_offline/i })).toBeInTheDocument();
  });

  it('calls selectRun when a master row is clicked', () => {
    const selectRun = vi.fn();
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows, visibleRows: rows, canLoadMore: false, remainingCount: 0, runInProgress: false, isStopping: false },
      cancelRun: vi.fn(),
      selectRun,
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /1\/2\/2024.*jd_offline/i }));

    expect(selectRun).toHaveBeenCalledWith('run-2');
  });

  it('renders manual links in the detail pane for a selected jd_offline run', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows, visibleRows: rows, canLoadMore: false, remainingCount: 0, runInProgress: false, isStopping: false, selectedRun: jdOfflineRun },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByText('Frieren')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /example\.com/i })).toHaveAttribute(
      'href',
      'https://example.com/a',
    );
  });

  // The exact case from the field: a finished jd_offline run with 0 downloaded
  // and 0 failed was reporting "Downloading 8" for episodes it never attempted.
  it('labels the pending episodes "Not attempted" on a run that has terminated', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows, visibleRows: rows, canLoadMore: false, remainingCount: 0, runInProgress: false, isStopping: false, selectedRun: jdOfflineRun },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByText('Not attempted')).toBeInTheDocument();
    expect(screen.queryByText('Downloading')).not.toBeInTheDocument();
  });

  it('labels the pending episodes "Downloading" only while the run is still open', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: {
        status: 'ready',
        rows,
        visibleRows: rows,
        canLoadMore: false,
        remainingCount: 0,
        runInProgress: true,
        isStopping: false,
        selectedRun: { ...jdOfflineRun, status: 'running' },
      },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByText('Downloading')).toBeInTheDocument();
    expect(screen.queryByText('Not attempted')).not.toBeInTheDocument();
  });

  it('renders the "Up to date" counter in the detail pane for a selected run', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows, visibleRows: rows, canLoadMore: false, remainingCount: 0, runInProgress: false, isStopping: false, selectedRun: okRun },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    const label = screen.getByText('Up to date');
    expect(label).toBeInTheDocument();
    expect(label.nextElementSibling).toHaveTextContent('2');
  });

  it('renders an empty detail-pane prompt when no run is selected', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows, visibleRows: rows, canLoadMore: false, remainingCount: 0, runInProgress: false, isStopping: false },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByText(/select a run/i)).toBeInTheDocument();
  });

  it('reveals older runs by scrolling the rail, with no load-more control', () => {
    const loadMore = vi.fn();
    const onScroll = vi.fn();
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: {
        status: 'ready',
        rows: Array.from({ length: 25 }, (_, index) => ({
          runId: `run-${index + 1}`,
          startedLabel: `row-${index + 1}`,
          statusLabel: 'ok',
          trigger: 'manual',
          episodesDownloaded: 0,
          episodesFailed: 0,
          isSelected: index === 0,
        })),
        visibleRows: Array.from({ length: 20 }, (_, index) => ({
          runId: `run-${index + 1}`,
          startedLabel: `row-${index + 1}`,
          statusLabel: 'ok',
          trigger: 'manual',
          episodesDownloaded: 0,
          episodesFailed: 0,
          isSelected: index === 0,
        })),
        canLoadMore: true,
        remainingCount: 5,
        runInProgress: false,
        isStopping: false,
        selectedRun: okRun,
      },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore,
      scrollRef: { current: null },
      onScroll,
    });

    render(<RunHistoryPanel />);

    expect(screen.queryByRole('button', { name: /load .* more runs/i })).not.toBeInTheDocument();

    fireEvent.scroll(screen.getByTestId('run-history-scroll'));

    expect(screen.getAllByRole('button', { name: /row-/i })).toHaveLength(20);
    expect(onScroll).toHaveBeenCalled();
  });
});

describe('RunHistoryPanel stop control', () => {
  afterEach(() => {
    cleanup();
  });

  it('offers no stop control when no run is in progress', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows, visibleRows: rows, canLoadMore: false, remainingCount: 0, runInProgress: false, isStopping: false },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.queryByRole('button', { name: /stop run/i })).not.toBeInTheDocument();
  });

  it('stops the run when the stop control is pressed', () => {
    const cancelRun = vi.fn().mockResolvedValue(undefined);
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows, visibleRows: rows, canLoadMore: false, remainingCount: 0, runInProgress: true, isStopping: false },
      cancelRun,
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);
    fireEvent.click(screen.getByRole('button', { name: /stop run/i }));

    expect(cancelRun).toHaveBeenCalledTimes(1);
  });

  it('surfaces a refused stop without hiding the history', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: {
        status: 'ready',
        rows,
        visibleRows: rows,
        canLoadMore: false,
        remainingCount: 0,
        runInProgress: true,
        isStopping: false,
        errorMessage: 'no download run in progress',
      },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('no download run in progress');
    expect(screen.getByRole('button', { name: /stop run/i })).toBeInTheDocument();
  });
});

describe('RunHistoryPanel stopping feedback', () => {
  afterEach(() => {
    cleanup();
  });

  // Stopping is not instant, so the control must show it is working. Without this
  // the button looks inert and the press appears to have done nothing.
  it('shows a pending stop control and explains what it is waiting for', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: {
        status: 'ready',
        rows,
        visibleRows: rows,
        canLoadMore: false,
        remainingCount: 0,
        runInProgress: true,
        isStopping: true,
      },
      cancelRun: vi.fn(),
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);

    const stopButton = screen.getByRole('button', { name: /stopping/i });
    expect(stopButton).toBeDisabled();
    expect(screen.getByText(/ends after the episode it is already downloading/i)).toBeInTheDocument();
  });

  it('does not re-request a stop while one is already pending', () => {
    const cancelRun = vi.fn();
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: {
        status: 'ready',
        rows,
        visibleRows: rows,
        canLoadMore: false,
        remainingCount: 0,
        runInProgress: true,
        isStopping: true,
      },
      cancelRun,
      selectRun: vi.fn(),
      loadMore: vi.fn(),
      scrollRef: { current: null },
      onScroll: vi.fn(),
    });

    render(<RunHistoryPanel />);
    fireEvent.click(screen.getByRole('button', { name: /stopping/i }));

    expect(cancelRun).not.toHaveBeenCalled();
  });
});
