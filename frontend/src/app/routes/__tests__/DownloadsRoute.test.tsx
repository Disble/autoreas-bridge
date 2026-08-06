import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DownloadsRoute } from '../DownloadsRoute';

vi.mock('../../../features/download/ui/ManualTriggerButton/ManualTriggerButton', () => ({
  ManualTriggerButton: () => <div>manual trigger button</div>,
}));

vi.mock('../../../features/download/ui/SoloAnimeDownloadPanel/SoloAnimeDownloadPanel', () => ({
  SoloAnimeDownloadPanel: () => <div>solo anime download panel</div>,
}));

vi.mock('../../../features/download/ui/RunHistoryPanel/RunHistoryPanel', () => ({
  RunHistoryPanel: () => <div>run history panel</div>,
}));

vi.mock('../../../features/download/ui/SchedulePanel/SchedulePanel', () => ({
  SchedulePanel: () => <div>schedule panel</div>,
}));

vi.mock('../../../features/download/ui/HosterPriorityEditor/HosterPriorityEditor', () => ({
  HosterPriorityEditor: () => <div>hoster priority editor</div>,
}));

vi.mock('../../../features/download/ui/JDConfigPanel/JDConfigPanel', () => ({
  JDConfigPanel: () => <div>jd config panel</div>,
}));

vi.mock('../../../features/download/ui/EpisodeRenamePanel/EpisodeRenamePanel', () => ({
  EpisodeRenamePanel: () => <div>episode rename panel</div>,
}));

afterEach(cleanup);

function selectTab(name: string): void {
  fireEvent.click(screen.getByRole('tab', { name }));
}

describe('DownloadsRoute', () => {
  // The act-now controls, the schedule, and the run history are what the user
  // opens daily, so they must be the landing tab -- reaching them never costs a
  // click. The schedule sits here rather than in Configuration because its
  // last/next run line is glance information, and splitting the card so the
  // status shows in one tab and the days in another would be worse than either.
  it('lands on the Downloads tab with the act-now panels, the schedule, and the run history', () => {
    render(<DownloadsRoute />);

    expect(screen.getByText('manual trigger button')).toBeInTheDocument();
    expect(screen.getByText('solo anime download panel')).toBeInTheDocument();
    expect(screen.getByText('schedule panel')).toBeInTheDocument();
    expect(screen.getByText('run history panel')).toBeInTheDocument();
  });

  // Configuration is deliberately one tab away rather than one route away: the
  // observe-then-tune loop (a failed run in history -> reorder hoster priority)
  // has to stay inside this route.
  it('reveals every configuration panel on the Configuration tab', () => {
    render(<DownloadsRoute />);

    selectTab('Configuration');

    expect(screen.getByText('hoster priority editor')).toBeInTheDocument();
    expect(screen.getByText('jd config panel')).toBeInTheDocument();
    expect(screen.getByText('episode rename panel')).toBeInTheDocument();
  });

  it('returns to the act-now panels when the Downloads tab is selected again', () => {
    render(<DownloadsRoute />);

    selectTab('Configuration');
    selectTab('Downloads');

    expect(screen.getByText('manual trigger button')).toBeInTheDocument();
  });
});
