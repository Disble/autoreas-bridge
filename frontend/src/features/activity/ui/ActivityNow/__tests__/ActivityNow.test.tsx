import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityHourBar, ActivityNowView } from '../../../activity-source/activity.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { ActivityNow } from '../ActivityNow';

/** The source the component reads, swapped per test. */
const sourceState: { source: ActivitySource } = { source: createSource(() => new Promise(() => undefined)) };

vi.mock('../../../activity-source/activity-source.helpers', () => ({
  createActivitySource: () => sourceState.source,
}));

/** A source whose Now read the test controls. */
function createSource(getNow: ActivitySource['getNow']): ActivitySource {
  return { getNow, pinMoment: vi.fn(), subscribeRecorder: () => () => undefined, listIncidents: vi.fn(), getIncident: vi.fn(), getRequest: vi.fn(), listRuns: vi.fn(), getRunStory: vi.fn() };
}

/** Builds hour `index` of the 24, with data unless it falls in the gap. */
function hour(index: number): ActivityHourBar {
  const isGap = index >= 10 && index < 18;
  return { hourStartMs: index * 3_600_000, count: isGap ? 0 : 80, failed: index === 23 ? 8 : 0, failedShare: index === 23 ? 0.1 : 0, hasData: !isGap };
}

/** A resolved view with one open incident and one change. */
const VIEW: ActivityNowView = {
  status: { kind: 'problems', sentence: '1 problem needs a look', quietMinutes: 0, problems: 1 },
  lastPhoneContactMs: Date.now(),
  uptimeMs: 3 * 3_600_000 + 26 * 60_000,
  requestsToday: 1912,
  openIncidents: 1,
  changesToday: 7,
  hours: Array.from({ length: 24 }, (_unused, index) => hour(index)),
  needsALook: [
    { latestId: 9, fingerprint: 'f', reason: 'http_5xx', title: 'Sync failed for 5 requests', latestAtMs: 1, firstSeenAtMs: 1, occurrences: 5, isNew: true, isError: true },
  ],
  recentChanges: [
    {
      id: 3,
      atMs: 1,
      reportedAtMs: undefined,
      source: 'mobile',
      actionType: 'episode_adjusted',
      animeId: 'a-1',
      animeName: 'Date A Live IV',
      correlationId: '',
      beforeJson: '{"NroCapVisto":10}',
      afterJson: '{"NroCapVisto":11}',
    },
  ],
};

/** A resolved view where nothing was ever recorded. */
const EMPTY_VIEW: ActivityNowView = {
  ...VIEW,
  status: { kind: 'quiet', sentence: 'The phone has been quiet for 3 min', quietMinutes: 3, problems: 0 },
  lastPhoneContactMs: undefined,
  requestsToday: 0,
  openIncidents: 0,
  changesToday: 0,
  hours: Array.from({ length: 24 }, (_unused, index) => ({ ...hour(index), count: 0, failed: 0, failedShare: 0, hasData: false })),
  needsALook: [],
  recentChanges: [],
};

/** Renders the Now tab inside a router. */
function renderNow(onOpenIncident = vi.fn()) {
  render(
    <MemoryRouter>
      <ActivityNow onOpenIncident={onOpenIncident} />
    </MemoryRouter>,
  );
  return onOpenIncident;
}

describe('ActivityNow', () => {
  beforeEach(() => {
    sourceState.source = createSource(() => new Promise(() => undefined));
  });

  it('shows only the layout-shaped skeleton while the first read is unresolved', () => {
    renderNow();

    const region = screen.getByRole('status', { name: 'Loading activity' });
    expect(within(region).getByTestId('activity-now-skeleton-figures').children).toHaveLength(3);
    expect(within(region).getByTestId('activity-now-skeleton-chart').children).toHaveLength(24);
    const lists = within(region).getAllByTestId('activity-now-skeleton-list');
    expect(lists).toHaveLength(2);
    // Each list mirrors its heading plus three rows.
    expect(lists.map((list) => list.children.length)).toEqual([4, 4]);
    expect(screen.queryByRole('heading', { name: 'Needs a look' })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Nothing recorded yet')).toBeNull();
  });

  it('answers "is everything fine?" once the view resolves', async () => {
    sourceState.source = createSource(() => Promise.resolve(VIEW));
    const onOpenIncident = renderNow();

    expect(await screen.findByRole('heading', { name: '1 problem needs a look' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading activity' })).toBeNull();
    expect(screen.getByText('Last contact just now · up 3 h 26 min')).toBeInTheDocument();
    expect(document.querySelector('[data-status-dot]')).toHaveClass('bg-warning');
    expect(screen.getByText('Requests today').nextElementSibling).toHaveTextContent('1,912');
    expect(screen.getByText('Open incidents').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Changes today').nextElementSibling).toHaveTextContent('7');

    const chart = screen.getByRole('img', { name: 'Last 24 hours: 1,280 requests, 8 failed. No data for 8 of 24 hours.' });
    expect(chart.querySelectorAll('[data-hour-bar]')).toHaveLength(24);
    expect(chart.querySelectorAll('[data-hour-bar="gap"]')).toHaveLength(8);
    const lastBar = chart.querySelectorAll('[data-hour-bar="data"]')[15].firstElementChild as HTMLElement;
    expect(lastBar.style.height).toBe('100%');
    expect((lastBar.firstElementChild as HTMLElement).style.height).toBe('10%');

    expect(screen.getByText('episode 10 → 11 · from the phone')).toBeInTheDocument();
    expect(screen.getByText('Date A Live IV')).toBeInTheDocument();
    expect(screen.getByText('Recording')).toBeInTheDocument();

    const incident = screen.getByRole('button', { name: /Sync failed for 5 requests/ });
    expect(within(incident).getByText('New')).toBeInTheDocument();
    expect(incident.querySelector('[data-incident-mark]')).toHaveClass('text-danger');
    fireEvent.click(incident);
    expect(onOpenIncident).toHaveBeenCalledWith(9);
  });

  it('marks a slow, known incident without the New chip and says so when no change exists', async () => {
    sourceState.source = createSource(() =>
      Promise.resolve({ ...VIEW, recentChanges: [], needsALook: [{ ...VIEW.needsALook[0], isNew: false, isError: false, title: 'The anime list is slow' }] }),
    );
    renderNow();

    const incident = await screen.findByRole('button', { name: /The anime list is slow/ });
    expect(within(incident).queryByText('New')).toBeNull();
    expect(incident.querySelector('[data-incident-mark]')).toHaveClass('text-warning');
    expect(screen.getByText('No recent changes')).toBeInTheDocument();
  });

  it('says nothing needs a look when no incident is open', async () => {
    sourceState.source = createSource(() => Promise.resolve({ ...VIEW, needsALook: [] }));
    renderNow();

    expect(await screen.findByText('Nothing needs a look')).toBeInTheDocument();
  });

  it('shows the failure alert alone and recovers through Try again', async () => {
    const getNow = vi.fn<ActivitySource['getNow']>().mockRejectedValueOnce(new Error('db')).mockResolvedValue(VIEW);
    sourceState.source = createSource(getNow);
    renderNow();

    expect(await screen.findByText('Activity could not read its history')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading activity' })).toBeNull();
    expect(screen.queryByText('Nothing recorded yet')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: '1 problem needs a look' })).toBeInTheDocument();
    expect(screen.queryByText('Activity could not read its history')).toBeNull();
  });

  it('shows the first-run empty state alone when nothing was ever recorded', async () => {
    sourceState.source = createSource(() => Promise.resolve(EMPTY_VIEW));
    renderNow();

    expect(await screen.findByText('Nothing recorded yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pair a phone' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading activity' })).toBeNull();
    expect(screen.queryByText('Activity could not read its history')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'The phone has been quiet for 3 min' })).toBeNull();
  });
});
