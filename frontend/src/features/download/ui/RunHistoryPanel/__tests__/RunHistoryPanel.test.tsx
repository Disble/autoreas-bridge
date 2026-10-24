import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DownloadRunView } from '../../../../../shared/contracts/download.types';
import { RunHistoryPanel } from '../RunHistoryPanel';
import { toRunHistoryPanelViewModel } from '../run-history-panel.helpers';
import type { RunHistoryPanelViewModel, RunHistoryStoryState, RunHistoryStoryStep } from '../run-history-panel.types';
import { toRunHistoryDetailViewModel, withCatalogNames } from '../run-history-story.helpers';
import { useRunHistoryPanel } from '../use-run-history-panel';
import { atRoute } from './run-history-router';

vi.mock('../use-run-history-panel', () => ({
  useRunHistoryPanel: vi.fn(),
}));

/** The mocked hook, so these tests judge the rendered panel and not the data it derives. */
const mockedUseRunHistoryPanel = vi.mocked(useRunHistoryPanel);

/** Builds a finished run whose fields a case overrides. */
function createRun(runId: string, overrides: Partial<DownloadRunView> = {}): DownloadRunView {
  return {
    runId,
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
    ...overrides,
  };
}

/** A finished run that left manual links because JDownloader was offline. */
const jdOfflineRun = createRun('run-2', {
  trigger: 'scheduled',
  animesChecked: 5,
  episodesFound: 2,
  episodesDownloaded: 0,
  episodesDownloading: 2,
  upToDateCount: 0,
  jdAvailable: false,
  status: 'jd_offline',
  manualLinks: [{ animeId: 'a1', anime: 'Frieren', episode: 12, links: ['https://example.com/a', 'https://example.com/b'] }],
});

/** Builds one stored step about an anime. */
function step(entityId: string, eventType: string, metadata: Record<string, unknown>, level = 'info'): RunHistoryStoryStep {
  return { entityId, eventType, level, metadataJson: JSON.stringify(metadata) };
}

/** Options for one mocked panel render. */
interface MockOptions {
  readonly selectedRunId?: string;
  readonly story?: RunHistoryStoryState;
  readonly overrides?: Partial<RunHistoryPanelViewModel>;
}

/** Feeds the mocked hook a view model built by the real helpers and returns its spies. */
function mockPanel(runs: readonly DownloadRunView[], { selectedRunId, story = { status: 'loading' }, overrides = {} }: MockOptions = {}) {
  const list = toRunHistoryPanelViewModel(runs, selectedRunId, 20);
  const detail = list.selectedRun === undefined ? undefined : toRunHistoryDetailViewModel(list.selectedRun, story);
  const actions = {
    cancelRun: vi.fn(),
    selectRun: vi.fn(),
    loadMore: vi.fn(),
    toggleProblems: vi.fn(),
    copyText: vi.fn(),
    editAnime: vi.fn(),
    openLink: vi.fn(),
    onScroll: vi.fn(),
  };
  mockedUseRunHistoryPanel.mockReturnValue({ viewModel: { ...list, detail, ...overrides }, scrollRef: { current: null }, ...actions });
  render(<RunHistoryPanel />, { wrapper: atRoute() });
  return actions;
}

afterEach(() => {
  cleanup();
});

describe('RunHistoryPanel states', () => {
  it('renders a loading skeleton and no runs while the status is "loading"', () => {
    mockPanel([createRun('run-1')], { overrides: { status: 'loading' } });

    expect(screen.getByRole('status', { name: 'Loading download run history' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Runs' })).not.toBeInTheDocument();
  });

  it('renders an empty state when there are no runs', () => {
    mockPanel([]);

    expect(screen.getByText(/no download runs yet/i)).toBeInTheDocument();
  });

  it('renders the error message when the status is "error"', () => {
    mockPanel([], { overrides: { status: 'error', errorMessage: 'network down' } });

    expect(screen.getByRole('alert')).toHaveTextContent('network down');
  });

  it('shows the awaiting-selection pane when no run is selected', () => {
    mockPanel([createRun('run-1')], { overrides: { detail: undefined } });

    expect(screen.getByRole('heading', { level: 3, name: 'No run selected' })).toBeInTheDocument();
    expect(screen.getByText('Pick a run to see its counters and links.')).toBeInTheDocument();
  });
});

describe('RunHistoryPanel master list', () => {
  it('lists each run under its day with the trigger label and a status icon, and selects on press', () => {
    const actions = mockPanel([createRun('run-1'), jdOfflineRun]);
    const list = screen.getByRole('list', { name: 'Runs' });
    const offline = within(list).getByRole('button', { name: /Scheduled/ });

    expect(within(list).getByRole('button', { name: /Manual check/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(offline).getByRole('img', { name: 'JDownloader offline' })).toBeInTheDocument();
    fireEvent.click(offline);
    expect(actions.selectRun).toHaveBeenCalledWith('run-2');
  });

  it('renders one batch of 20 rows and reveals older runs by scrolling, with no load-more control', () => {
    const runs = Array.from({ length: 25 }, (_, index) => createRun(`run-${index + 1}`));
    const actions = mockPanel(runs);

    expect(within(screen.getByRole('list', { name: 'Runs' })).getAllByRole('button')).toHaveLength(20);
    expect(screen.queryByRole('button', { name: /load .* more runs/i })).not.toBeInTheDocument();
    fireEvent.scroll(screen.getByTestId('run-history-scroll'));
    expect(actions.onScroll).toHaveBeenCalled();
  });
});

describe('RunHistoryPanel Problems filter', () => {
  it('shows the problem count with no text label and toggles the filter', () => {
    const actions = mockPanel([createRun('run-1'), jdOfflineRun, createRun('run-3', { status: 'error' })]);
    const filter = screen.getByRole('button', { name: 'Show only the 2 runs with problems' });

    expect(filter).toHaveTextContent(/^2$/);
    expect(filter).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(filter);
    expect(actions.toggleProblems).toHaveBeenCalledTimes(1);
  });

  it('reads as pressed while on', () => {
    mockPanel([jdOfflineRun], { overrides: { problemsOnly: true } });

    expect(screen.getByRole('button', { name: 'Showing 1 runs with problems. Show all runs' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('is hidden when no run had a problem', () => {
    mockPanel([createRun('run-1')]);

    expect(screen.queryByRole('button', { name: /runs with problems/ })).not.toBeInTheDocument();
  });
});

describe('RunHistoryPanel detail', () => {
  /** The stored story of the jd_offline run: one anime checked, its link offered, one skipped. */
  const story: RunHistoryStoryState = {
    status: 'ready',
    story: {
      truncated: false,
      steps: [
        step('a1', 'download.anime_checked', { animeName: 'Frieren', onDiskCount: 11, latestOnline: 12 }),
        step('a2', 'download.skipped', { animeName: 'Bocchi', reason: 'missing_pagina' }),
      ],
    },
  };

  it('lists the anime of each outcome with its links, and copies every link at once', () => {
    const actions = mockPanel([{ ...jdOfflineRun, skippedCount: 1 }], { story });
    const pending = screen.getByRole('button', { name: /Not attempted/ });

    expect(pending).toHaveTextContent('Not attempted2');
    expect(screen.getByText('Frieren').parentElement).toHaveTextContent('Episode 12');
    expect(screen.getAllByRole('link', { name: /example\.com\/a/ })[0]).not.toHaveAttribute('href');
    fireEvent.click(screen.getByRole('button', { name: 'Copy all links' }));
    expect(actions.copyText).toHaveBeenCalledWith('https://example.com/a\nhttps://example.com/b', 'All links copied');
  });

  it('opens a skipped anime in the editor', () => {
    const actions = mockPanel([{ ...jdOfflineRun, skippedCount: 1 }], { story });

    expect(screen.getByText('Bocchi').parentElement).toHaveTextContent('Missing page');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bocchi' }));
    expect(actions.editAnime).toHaveBeenCalledWith('a2');
  });

  it('shows the run id, its status label and the error summary verbatim', () => {
    const actions = mockPanel([createRun('run-9', { status: 'error', errorSummary: "list today's animes: database is locked" })], { story: { status: 'ready', story: { steps: [], truncated: false } } });

    expect(screen.getByRole('heading', { level: 3, name: 'Run run-9' })).toBeInTheDocument();
    expect(screen.getByTestId('run-status')).toHaveTextContent('Error');
    expect(screen.getByRole('alert')).toHaveTextContent("list today's animes: database is locked");
    fireEvent.click(screen.getByRole('button', { name: 'Copy run id' }));
    expect(actions.copyText).toHaveBeenCalledWith('run-9', 'Run id copied');
  });

  it('shows the group headers with counts only, and the retention note, when the story kept nothing', () => {
    mockPanel([{ ...jdOfflineRun, manualLinks: undefined }], { story: { status: 'ready', story: { steps: [], truncated: false } } });

    expect(within(screen.getByRole('region', { name: 'Not attempted 2' })).queryByRole('listitem')).toBeNull();
    expect(screen.getByRole('img', { name: 'Per-anime detail is kept for 90 days' })).toBeInTheDocument();
  });

  it('says the episodes were not recorded inside a finished run group that has a count but no line', () => {
    const steps = [step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode: 3 })];
    mockPanel([createRun('run-old', { episodesFound: 3, episodesDownloading: 2, upToDateCount: 0, status: 'interrupted' })], {
      story: { status: 'ready', story: { steps, truncated: false } },
    });

    expect(screen.getByText('Episodes not recorded')).toBeInTheDocument();
    expect(screen.getByText('This run kept no per-anime record of these episodes.')).toBeInTheDocument();
  });

  it('shows a skeleton in place of an anime name the catalog has not answered yet, and nothing else waits', () => {
    const run = createRun('run-old');
    const steps = [step('a1', 'download.episode_downloaded', { episode: 3 })];
    const detail = withCatalogNames(toRunHistoryDetailViewModel(run, { status: 'ready', story: { steps, truncated: false } }), new Map());
    mockPanel([run], { overrides: { detail } });

    expect(screen.getByRole('status', { name: 'Loading anime name' })).toBeInTheDocument();
    expect(screen.queryByText('a1')).not.toBeInTheDocument();
    expect(screen.getByText('Episode 3')).toBeInTheDocument();
  });

  it('opens a manual link in the default browser from its button and its text, with no WebView anchor', () => {
    const actions = mockPanel([jdOfflineRun], { story });

    fireEvent.click(screen.getAllByRole('button', { name: 'Open in browser' })[0]);
    fireEvent.click(screen.getByText('example.com/b'));

    expect(actions.openLink.mock.calls).toEqual([['https://example.com/a'], ['https://example.com/b']]);
    expect(document.querySelector('a[target="_blank"]')).toBeNull();
  });

  it('flags a truncated story beside the totals', () => {
    mockPanel([jdOfflineRun], { story: { ...story, story: { ...story.story, truncated: true } } as RunHistoryStoryState });

    expect(screen.getByRole('img', { name: 'Showing the first 2 steps of a longer run.' })).toBeInTheDocument();
  });

  it('names the pending group Downloading on a live run', () => {
    mockPanel([{ ...jdOfflineRun, status: 'running', finishedAtMs: undefined }], { story });

    expect(screen.getByRole('button', { name: /Downloading/ })).toBeInTheDocument();
    expect(screen.queryByText('Not attempted')).not.toBeInTheDocument();
  });
});

describe('RunHistoryPanel stop control', () => {
  it('sits in the card header beside the Run history title', () => {
    mockPanel([createRun('run-1', { status: 'running' })]);
    const header = screen.getByTestId('run-history-header');

    expect(within(header).getByText('Run history')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /stop run/i })).toBeInTheDocument();
  });

  it('offers no stop control when no run is in progress', () => {
    mockPanel([createRun('run-1')]);

    expect(screen.queryByRole('button', { name: /stop run/i })).not.toBeInTheDocument();
  });

  it('stops the run when the stop control is pressed', () => {
    const actions = mockPanel([createRun('run-1', { status: 'running' })]);
    fireEvent.click(screen.getByRole('button', { name: /stop run/i }));

    expect(actions.cancelRun).toHaveBeenCalledTimes(1);
  });

  it('surfaces a refused stop without hiding the history', () => {
    mockPanel([createRun('run-1', { status: 'running' })], { overrides: { errorMessage: 'no download run in progress' } });

    expect(screen.getByRole('alert')).toHaveTextContent('no download run in progress');
    expect(screen.getByRole('button', { name: /stop run/i })).toBeInTheDocument();
  });

  // Stopping is not instant, so the control must show it is working. Without this
  // the button looks inert and the press appears to have done nothing.
  it('shows a pending stop control that cannot be pressed again, and explains what it waits for', () => {
    const actions = mockPanel([createRun('run-1', { status: 'running' })], { overrides: { isStopping: true } });
    const stopButton = screen.getByRole('button', { name: /stopping/i });

    expect(stopButton).toBeDisabled();
    expect(screen.getByText(/ends after the episode it is already downloading/i)).toBeInTheDocument();
    fireEvent.click(stopButton);
    expect(actions.cancelRun).not.toHaveBeenCalled();
  });
});
