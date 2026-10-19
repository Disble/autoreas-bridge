import { toast } from '@heroui/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityNowView } from '../../../activity-source/activity.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import type { HistorySource } from '../../../history-source/history-source.types';
import { ActivityScreen } from '../ActivityScreen';

/** A resolved Now view with one incident in "Needs a look". */
const NOW_VIEW: ActivityNowView = {
  status: { kind: 'problems', sentence: '1 problem needs a look', quietMinutes: 0, problems: 1 },
  lastPhoneContactMs: 0,
  uptimeMs: 60_000,
  requestsToday: 3,
  openIncidents: 1,
  changesToday: 0,
  hours: [],
  needsALook: [{ latestId: 9, fingerprint: 'fp', reason: 'http_5xx', title: 'Sync failed for 5 requests', latestAtMs: 0, firstSeenAtMs: 0, occurrences: 5, isNew: true, isError: true }],
  recentChanges: [],
};

/** The source the screen reads: Now never resolves unless a test says so, the pin succeeds. */
const source: ActivitySource = {
  getNow: vi.fn(() => new Promise<ActivityNowView>(() => undefined)),
  pinMoment: vi.fn(() => Promise.resolve()),
  subscribeRecorder: () => () => undefined,
  listIncidents: vi.fn(() => Promise.resolve([])),
  getIncident: vi.fn<ActivitySource['getIncident']>(() => new Promise(() => undefined)),
  getRequest: vi.fn(),
  listRecoveredRuns: vi.fn(() => Promise.resolve([])),
  getRunStory: vi.fn(),
};

vi.mock('../../../activity-source/activity-source.helpers', () => ({
  createActivitySource: () => source,
}));

/** The History and recorder source: both reads stay pending, so each view rests on its skeleton. */
const historySource: HistorySource = {
  searchHistory: vi.fn(() => new Promise<never>(() => undefined)),
  listRecorder: vi.fn(() => new Promise<never>(() => undefined)),
  subscribeRecorder: () => () => undefined,
};

vi.mock('../../../history-source/history-source.helpers', () => ({
  createHistorySource: () => historySource,
}));

/** Renders the shell inside a router. */
function renderScreen() {
  render(
    <MemoryRouter>
      <ActivityScreen />
    </MemoryRouter>,
  );
}

describe('ActivityScreen', () => {
  beforeEach(() => {
    vi.mocked(source.getIncident).mockClear();
    vi.mocked(historySource.searchHistory).mockClear();
    vi.mocked(historySource.listRecorder).mockClear();
  });

  it('opens on Now with the three tabs and the pin action', () => {
    renderScreen();

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Now', 'Incidents', 'History']);
    expect(screen.getByRole('tab', { name: 'Now' })).toHaveAttribute('aria-selected', 'true');
    // The bridge tab style: the selected tab carries the shared sliding indicator, as in Season.
    expect(screen.getByRole('tab', { name: 'Now' }).querySelector('[data-slot="tabs-indicator"]')).not.toBeNull();
    expect(screen.getByRole('status', { name: 'Loading activity' })).toBeInTheDocument();
  });

  it('shows the Incidents view, resting until a pick, and History loading its first page', async () => {
    renderScreen();

    fireEvent.click(screen.getByRole('tab', { name: 'Incidents' }));
    expect(screen.getByRole('heading', { name: 'No incident selected' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Where it happened' })).toBeInTheDocument();
    expect(await screen.findByText('No incidents in the last 7 days')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading activity' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('status', { name: 'Loading History' })).toBeInTheDocument();
    expect(historySource.searchHistory).toHaveBeenCalledTimes(1);
  });

  it('opens the 2-hour recorder from Now and goes back to the tabs', () => {
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /See every request from the last 2 hours/ }));
    expect(screen.queryByRole('tab', { name: 'Now' })).toBeNull();
    expect(historySource.listRecorder).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('tab', { name: 'Now' })).toHaveAttribute('aria-selected', 'true');
  });

  it('sends "Pair a phone" on a first-run History to the pairing route', async () => {
    vi.mocked(historySource.searchHistory).mockResolvedValueOnce({ calendar: [], days: [], nextCursor: '' });
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<ActivityScreen />} path="/" />
          <Route element={<p>Pairing route</p>} path="/pairing" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pair a phone' }));

    expect(screen.getByText('Pairing route')).toBeInTheDocument();
  });

  it('opens the incident picked in "Needs a look" on the Incidents tab, read once by its id', async () => {
    vi.mocked(source.getNow).mockResolvedValueOnce(NOW_VIEW);
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /Sync failed for 5 requests/ }));

    expect(screen.getByRole('tab', { name: 'Incidents' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status', { name: 'Loading the incident' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No incident selected' })).toBeNull();
    expect(source.getIncident).toHaveBeenCalledExactlyOnceWith(9);
  });

  it('pins the moment from the action beside the tabs', async () => {
    const success = vi.spyOn(toast, 'success').mockReturnValue('t');
    renderScreen();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pin this moment' })));

    expect(source.pinMoment).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledTimes(1);
  });
});
