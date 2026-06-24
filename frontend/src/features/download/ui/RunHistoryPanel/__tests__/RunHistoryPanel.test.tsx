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
  },
  {
    runId: 'run-2',
    startedLabel: '1/2/2024, 12:00:00 AM',
    statusLabel: 'jd_offline',
    trigger: 'scheduled',
    episodesDownloaded: 0,
    episodesFailed: 0,
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
  skippedCount: 0,
  jdAvailable: false,
  status: 'jd_offline',
  manualLinks: [{ anime: 'Frieren', episode: 12, links: ['https://example.com/a'] }],
};

describe('RunHistoryPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a loading skeleton while the status is "loading"', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'loading', rows: [] },
      selectRun: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByLabelText('Loading download run history')).toBeInTheDocument();
  });

  it('renders an empty state when there are no runs', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'empty', rows: [] },
      selectRun: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByText(/no download runs yet/i)).toBeInTheDocument();
  });

  it('renders an error message when the status is "error"', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'error', rows: [], errorMessage: 'network down' },
      selectRun: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('network down');
  });

  it('renders every run as a selectable master-list row', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows },
      selectRun: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByRole('button', { name: /1\/1\/2024.*ok/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\/2\/2024.*jd_offline/i })).toBeInTheDocument();
  });

  it('calls selectRun when a master row is clicked', () => {
    const selectRun = vi.fn();
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows },
      selectRun,
    });

    render(<RunHistoryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /1\/2\/2024.*jd_offline/i }));

    expect(selectRun).toHaveBeenCalledWith('run-2');
  });

  it('renders manual links in the detail pane for a selected jd_offline run', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows, selectedRun: jdOfflineRun },
      selectRun: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByText('Frieren')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /example\.com/i })).toHaveAttribute(
      'href',
      'https://example.com/a',
    );
  });

  it('renders an empty detail-pane prompt when no run is selected', () => {
    mockedUseRunHistoryPanel.mockReturnValue({
      viewModel: { status: 'ready', rows },
      selectRun: vi.fn(),
    });

    render(<RunHistoryPanel />);

    expect(screen.getByText(/select a run/i)).toBeInTheDocument();
  });
});
