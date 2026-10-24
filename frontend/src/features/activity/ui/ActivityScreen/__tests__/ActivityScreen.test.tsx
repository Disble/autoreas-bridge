import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchKeyboardEvent } from '../../../../../shared/keyboard/dispatch.helpers';
import { resetKeyboardStore } from '../../../../../shared/keyboard/keyboard-scope.helpers';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import type { ActivityFeedSource } from '../../../feed-source/feed-source.types';
import type { ActivityFeedLine, ActivityFeedView } from '../../../feed-source/feed.types';
import type { HistorySource } from '../../../history-source/history-source.types';
import { buildDay, buildLine, buildOverview, buildView } from '../../../feed/__tests__/activity-feed.fixtures';
import type { ActivityDetailDrawerProps } from '../../ActivityDetailDrawer/activity-detail-drawer.types';
import { ActivityScreen } from '../ActivityScreen';

/** Recorder listeners the screen subscribed. */
const recorderListeners: (() => void)[] = [];

/** The feed port: each test sets what `searchFeed` resolves with. */
const feedSource = {
  searchFeed: vi.fn<ActivityFeedSource['searchFeed']>(),
  getOverview: vi.fn<ActivityFeedSource['getOverview']>(),
};

/** The History port: only its recorder subscription is used. */
const historySource: HistorySource = {
  subscribeRecorder: (listener) => {
    recorderListeners.push(() => listener({} as never));
    return () => undefined;
  },
};

/** The Activity port: only the pin is used. */
const activitySource = { pinMoment: vi.fn(() => Promise.resolve()) } as unknown as ActivitySource;

vi.mock('../../../feed-source/feed-source.helpers', () => ({ createActivityFeedSource: () => feedSource }));
vi.mock('../../../history-source/history-source.helpers', () => ({ createHistorySource: () => historySource }));
vi.mock('../../../activity-source/activity-source.helpers', () => ({ createActivitySource: () => activitySource }));
/** The paired devices the phone status line reads: none unless a test sets them. */
const getConnectedDevices = vi.fn(() => Promise.resolve<readonly { connection_status: string; last_seen_at_ms: number }[]>([]));

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({ bridgeRuntimeSource: { getConnectedDevices: () => getConnectedDevices() } }));
vi.mock('../../ActivityDetailDrawer/ActivityDetailDrawer', () => ({
  /** Stands in for writer B's drawer: shows which line is open. */
  ActivityDetailDrawer: ({ line }: ActivityDetailDrawerProps) => (line === undefined ? null : <aside aria-label="Activity detail">{line.line.id}</aside>),
}));

/** `count` change lines, newest first, with ids from `firstId` down. */
function lines(count: number, firstId: number): readonly ActivityFeedLine[] {
  return Array.from({ length: count }, (_unused, index) => buildLine({}, { id: String(firstId - index), atMs: Date.now() - (1000 - firstId + index) * 1000 }));
}

/** A page of `count` lines on today, with a cursor when more remain. */
function page(count: number, firstId: number, nextCursor = ''): ActivityFeedView {
  return buildView([buildDay(0, lines(count, firstId))], nextCursor);
}

/** Renders the screen inside a router. */
function renderScreen() {
  render(
    <MemoryRouter>
      <ActivityScreen />
    </MemoryRouter>,
  );
}

/** The types of the last feed read; with the failure filter on, its failure types. */
function lastFailureTypes(): readonly string[] | undefined {
  return feedSource.searchFeed.mock.calls.at(-1)?.[0]?.types;
}

/** Presses one key through the app's keyboard dispatcher. */
function pressKey(key: string) {
  act(() => {
    dispatchKeyboardEvent(
      { key, code: key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, defaultPrevented: false, isComposing: false, target: null, preventDefault: () => undefined },
      { navigate: vi.fn() },
    );
  });
}

/** The feed rows on screen. */
function rows() {
  return document.querySelectorAll('[data-feed-row]');
}

beforeEach(() => {
  recorderListeners.length = 0;
  feedSource.searchFeed.mockReset();
  feedSource.getOverview.mockReset();
  feedSource.getOverview.mockResolvedValue(buildOverview([{ type: 'change', lines: 41, failed: 2 }, { type: 'bridge', lines: 1, failed: 1 }]));
  resetKeyboardStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ActivityScreen', () => {
  it('shows the phone status line under the title, connected or offline, only while a phone has synced', async () => {
    feedSource.searchFeed.mockResolvedValue(page(1, 1));
    getConnectedDevices.mockResolvedValueOnce([{ connection_status: 'connected', last_seen_at_ms: Date.now() - 5 * 60_000 }]);
    renderScreen();

    expect(await screen.findByText('Phone connected · last sync 5m ago')).toHaveAttribute('data-phone-status', 'connected');

    cleanup();
    getConnectedDevices.mockResolvedValueOnce([{ connection_status: 'disconnected', last_seen_at_ms: Date.now() - 5 * 60_000 }]);
    renderScreen();
    expect(await screen.findByText('Phone offline · last sync 5m ago')).toHaveAttribute('data-phone-status', 'offline');

    cleanup();
    renderScreen();
    await screen.findByLabelText('2 failed');
    expect(document.querySelector('[data-phone-status]')).toBeNull();
  });

  it('shows only the skeleton while the first page is unread', () => {
    feedSource.searchFeed.mockReturnValue(new Promise(() => undefined));
    renderScreen();

    expect(screen.getByRole('status', { name: 'Loading activity' })).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });

  it('renders one batch of rows, then appends the next page near the bottom', async () => {
    feedSource.searchFeed.mockResolvedValueOnce(page(40, 100, 'c1')).mockResolvedValueOnce(page(40, 60));
    renderScreen();

    await waitFor(() => expect(rows()).toHaveLength(40));
    expect(screen.getByRole('region', { name: /Oct 22$/ })).toBeInTheDocument();
    expect(feedSource.searchFeed).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '', limit: 40, types: ['change', 'download', 'task', 'edit'] }));

    fireEvent.scroll(window);

    await waitFor(() => expect(rows()).toHaveLength(80));
    expect(feedSource.searchFeed).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
    expect(screen.getByText('Start of the last 24 hours')).toBeInTheDocument();
  });

  it('keeps the loaded window when live events arrive and reads the counts again (S8)', async () => {
    feedSource.searchFeed.mockResolvedValueOnce(page(40, 100, 'c1')).mockResolvedValueOnce(page(40, 60, 'c2'));
    renderScreen();
    await waitFor(() => expect(rows()).toHaveLength(40));
    fireEvent.scroll(window);
    await waitFor(() => expect(rows()).toHaveLength(80));
    feedSource.searchFeed.mockResolvedValueOnce(page(40, 101, 'fresh'));
    const overviewReads = feedSource.getOverview.mock.calls.length;

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => {
      recorderListeners.forEach((listener) => listener());
      recorderListeners.forEach((listener) => listener());
      vi.advanceTimersByTime(1000);
    });
    vi.useRealTimers();

    await waitFor(() => expect(document.querySelector('[data-feed-row="change:101"]')).not.toBeNull());
    expect(rows().length).toBeGreaterThanOrEqual(80);
    expect(feedSource.searchFeed).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '' }));
    expect(feedSource.getOverview).toHaveBeenCalledTimes(overviewReads + 1);
  });

  it('shows the failure alert, not rows, when the feed cannot be read, and reads again on Try again', async () => {
    feedSource.searchFeed.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(page(1, 1));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.queryByText('Activity could not read its feed')).not.toBeInTheDocument();
  });

  it('asks for a type, without reading, when every type is turned off', async () => {
    feedSource.searchFeed.mockResolvedValue(page(1, 1));
    renderScreen();
    await waitFor(() => expect(rows()).toHaveLength(1));
    const group = screen.getByRole('toolbar', { name: 'Activity filters' });

    for (const name of [/^Changes/, /^Downloads/, /^Tasks/, /^Edits/]) {
      fireEvent.click(within(group).getByRole('button', { name }));
    }

    expect(await screen.findByText('Pick at least one type to see activity.')).toBeInTheDocument();
    expect(feedSource.searchFeed).toHaveBeenCalledTimes(4);
    expect(rows()).toHaveLength(0);
  });

  it('shows each type count and its failures, and reads failures only from the failure button until its ×', async () => {
    feedSource.searchFeed.mockResolvedValue(page(1, 1));
    renderScreen();
    expect(await screen.findByLabelText('2 failed')).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Failures by type' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show only failures' }));

    await waitFor(() => expect(feedSource.searchFeed).toHaveBeenLastCalledWith(expect.objectContaining({ failuresOnly: true })));
    const pill = screen.getByRole('button', { name: 'Failures by type' });
    expect(pill).toHaveTextContent('3');
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Failures by type' })).toBeInTheDocument();

    // A second press on the pill closes the menu and keeps the filter on.
    fireEvent.click(pill);

    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu', { name: 'Failures by type' })).not.toBeInTheDocument();
    expect(pill).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Turn off failure filter' }));

    await waitFor(() => expect(feedSource.searchFeed).toHaveBeenLastCalledWith(expect.objectContaining({ failuresOnly: false })));
    expect(screen.queryByRole('button', { name: 'Turn off failure filter' })).not.toBeInTheDocument();
  });

  it('closes the failure menu on Esc, giving focus back to the pill, and on a press outside it, keeping the filter on', async () => {
    feedSource.searchFeed.mockResolvedValue(page(1, 1));
    renderScreen();
    expect(await screen.findByLabelText('2 failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show only failures' }));
    const pill = screen.getByRole('button', { name: 'Failures by type' });

    pressKey('Escape');

    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(pill);

    fireEvent.click(pill);
    const changes = within(screen.getByRole('menu', { name: 'Failures by type' })).getAllByRole('menuitemcheckbox')[0];
    fireEvent.pointerDown(changes);
    fireEvent.click(changes);

    await waitFor(() => expect(lastFailureTypes()).not.toContain('change'));
    expect(pill).toHaveAttribute('aria-expanded', 'true');

    fireEvent.pointerDown(screen.getByRole('toolbar', { name: 'Activity filters' }));

    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(feedSource.searchFeed).toHaveBeenLastCalledWith(expect.objectContaining({ failuresOnly: true }));
  });

  it('turns the failure filter off from the × while the menu is open', async () => {
    feedSource.searchFeed.mockResolvedValue(page(1, 1));
    renderScreen();
    expect(await screen.findByLabelText('2 failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show only failures' }));
    await waitFor(() => expect(feedSource.searchFeed).toHaveBeenLastCalledWith(expect.objectContaining({ failuresOnly: true })));

    fireEvent.click(screen.getByRole('button', { name: 'Turn off failure filter' }));

    await waitFor(() => expect(feedSource.searchFeed).toHaveBeenLastCalledWith(expect.objectContaining({ failuresOnly: false })));
    expect(screen.queryByRole('menu', { name: 'Failures by type' })).not.toBeInTheDocument();
  });

  it('opens a row in the drawer, moves it with ↑ / ↓ and closes it with Esc', async () => {
    feedSource.searchFeed.mockResolvedValue(page(3, 3));
    renderScreen();
    await waitFor(() => expect(rows()).toHaveLength(3));

    fireEvent.click(rows()[0]);
    expect(screen.getByRole('complementary', { name: 'Activity detail' })).toHaveTextContent('3');

    // Focus follows the open row, so the focus ring never marks a line the drawer no longer shows.
    pressKey('ArrowDown');
    expect(screen.getByRole('complementary', { name: 'Activity detail' })).toHaveTextContent('2');
    expect(document.activeElement).toBe(rows()[1]);
    pressKey('ArrowUp');
    expect(screen.getByRole('complementary', { name: 'Activity detail' })).toHaveTextContent('3');
    expect(document.activeElement).toBe(rows()[0]);
    pressKey('Escape');
    expect(screen.queryByRole('complementary', { name: 'Activity detail' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(rows()[0]);
  });

  it('keeps the drawer open on a press inside it or on a row, and closes it on a press anywhere else', async () => {
    feedSource.searchFeed.mockResolvedValue(page(2, 2));
    renderScreen();
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(rows()[0]);

    fireEvent.pointerDown(screen.getByRole('complementary', { name: 'Activity detail' }));
    fireEvent.pointerDown(rows()[1]);
    expect(screen.getByRole('complementary', { name: 'Activity detail' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('toolbar', { name: 'Activity filters' }));
    expect(screen.queryByRole('complementary', { name: 'Activity detail' })).not.toBeInTheDocument();
  });

  it('pins this moment from the page header', async () => {
    feedSource.searchFeed.mockResolvedValue(page(1, 1));
    renderScreen();
    const header = screen.getByRole('heading', { level: 1, name: 'Activity' }).closest('header') as HTMLElement;

    fireEvent.click(within(header).getByRole('button', { name: 'Pin this moment' }));

    await waitFor(() => expect(activitySource.pinMoment).toHaveBeenCalledTimes(1));
  });

  it('marks a failed bridge line red and a slow line amber, through the origin icon only', async () => {
    const failed = buildLine({ type: 'bridge', origin: 'bridge', failed: true, incidentId: 4 }, { kind: 'event', id: '2', title: 'Sync failed', detail: 'sync.error' });
    const slow = buildLine({ slow: true }, { id: '1', atMs: Date.now() - 2000 });
    feedSource.searchFeed.mockResolvedValue(buildView([buildDay(0, [failed, slow])]));
    renderScreen();

    expect(await screen.findByRole('img', { name: 'Bridge · failed' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Linked incident' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Phone · slow' })).toBeInTheDocument();
  });
});

describe('ActivityScreen chart and toolbar', () => {
  /** Start of the current hour. */
  const hourMs = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  /** The last three hourly slots, oldest first. */
  const slots = [2, 1, 0].map((back) => ({ startMs: hourMs - back * 3_600_000, endMs: hourMs - (back - 1) * 3_600_000, count: 3 - back, failed: back === 0 ? 1 : 0 }));

  /** The chart bars on screen. */
  function bars() {
    return [...document.querySelectorAll<HTMLElement>('[data-chart-bar]')];
  }

  /** The last feed read. */
  function lastQuery() {
    return feedSource.searchFeed.mock.calls.at(-1)?.[0];
  }

  /** Renders the screen once its chart bars are drawn. */
  async function renderChart() {
    feedSource.getOverview.mockResolvedValue({ ...buildOverview([]), slots });
    feedSource.searchFeed.mockResolvedValue(page(1, 1));
    renderScreen();
    await waitFor(() => expect(bars()).toHaveLength(3));
    expect(document.querySelectorAll('[data-chart-failure]')).toHaveLength(1);
  }

  it('marks the newest bar with the now line and packs more than 24 bars tighter', async () => {
    await renderChart();
    expect(document.querySelector('[data-chart-density]')).toHaveAttribute('data-chart-density', 'sparse');
    expect(bars().map((bar) => bar.hasAttribute('data-chart-now'))).toEqual([false, false, true]);
    cleanup();

    const many = Array.from({ length: 30 }, (_unused, index) => ({ startMs: hourMs - (29 - index) * 3_600_000, endMs: hourMs - (28 - index) * 3_600_000, count: 1, failed: 0 }));
    feedSource.getOverview.mockResolvedValue({ ...buildOverview([]), slots: many });
    renderScreen();

    await waitFor(() => expect(bars()).toHaveLength(30));
    expect(document.querySelector('[data-chart-density]')).toHaveAttribute('data-chart-density', 'dense');
  });

  it('reads the dragged range, shows its ×, and reads the whole window again once cleared', async () => {
    await renderChart();
    const group = screen.getByRole('group', { name: /Drag across bars/ });

    fireEvent.pointerDown(bars()[0]);
    fireEvent.pointerEnter(bars()[2]);
    expect(bars().map((bar) => bar.dataset.chartBar)).toEqual(['selected', 'selected', 'selected']);
    // While dragging, the bars hide their tooltips and the cursor turns to ew-resize.
    expect(group).toHaveAttribute('data-chart-dragging');
    expect(bars()[0]).not.toHaveAttribute('title');
    fireEvent.pointerUp(group);
    expect(group).not.toHaveAttribute('data-chart-dragging');
    expect(bars()[0]).toHaveAttribute('title');

    await waitFor(() => expect(lastQuery()).toMatchObject({ fromMs: slots[0].startMs }));
    expect(lastQuery()?.toMs).toBeGreaterThan(slots[2].startMs);

    fireEvent.click(screen.getByRole('button', { name: 'Clear time range' }));

    await waitFor(() => expect(lastQuery()).toMatchObject({ toMs: 0 }));
    expect(screen.queryByRole('button', { name: 'Clear time range' })).not.toBeInTheDocument();
  });

  it('selects one slot on a click, clears it on a second click, and drops a drag that leaves the chart', async () => {
    await renderChart();
    const group = screen.getByRole('group', { name: /Drag across bars/ });

    fireEvent.pointerDown(bars()[1]);
    fireEvent.pointerUp(group);
    await waitFor(() => expect(lastQuery()).toMatchObject({ fromMs: slots[1].startMs, toMs: slots[1].endMs - 1 }));
    expect(bars().map((bar) => bar.dataset.chartBar)).toEqual(['dimmed', 'selected', 'dimmed']);

    fireEvent.pointerDown(bars()[1]);
    fireEvent.pointerUp(group);
    await waitFor(() => expect(lastQuery()).toMatchObject({ toMs: 0 }));

    const reads = feedSource.searchFeed.mock.calls.length;
    fireEvent.pointerDown(bars()[0]);
    fireEvent.pointerLeave(group);
    fireEvent.pointerUp(group);
    expect(feedSource.searchFeed).toHaveBeenCalledTimes(reads);
    expect(bars().map((bar) => bar.dataset.chartBar)).toEqual(['idle', 'idle', 'idle']);
  });

  it.each([
    ['the scale switch reads the 7-day chart', '7 days', () => expect(feedSource.getOverview).toHaveBeenLastCalledWith('7d', 0, 0, 'all')],
    ['the origin switch reads phone lines only', 'Phone', () => expect(lastQuery()).toMatchObject({ origin: 'phone' })],
  ])('%s', async (_case, name, assertRead) => {
    await renderChart();

    fireEvent.click(screen.getByRole('radio', { name }));

    await waitFor(assertRead);
  });

  /** Opens the range picker and returns its dialog. */
  async function openPicker() {
    fireEvent.click(screen.getByRole('button', { name: /^Time range, / }));
    return screen.findByRole('dialog');
  }

  /** The picker's time field with that label (React Aria labels its root and its input group). */
  function timeField(dialog: HTMLElement, name: string) {
    return within(dialog).getAllByRole('group', { name })[0];
  }

  it('reads the picked days at their start and end times only on Apply, which a first day already enables', async () => {
    await renderChart();
    const dialog = await openPicker();
    const apply = within(dialog).getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    expect([...dialog.querySelectorAll('th')].map((head) => head.textContent)).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
    expect(timeField(dialog, 'Start time')).toHaveTextContent(/12\D*00\D*AM/);
    expect(timeField(dialog, 'End time')).toHaveTextContent(/11\D*59\D*PM/);

    fireEvent.click(within(dialog).getByRole('button', { name: /previous/i }));
    const picked = new Date();
    picked.setMonth(picked.getMonth() - 1, 15);
    /** The calendar cell of a day of the shown month. */
    const cell = (date: Date) => within(dialog).getByRole('button', { name: new RegExp(new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date)) });
    const reads = feedSource.searchFeed.mock.calls.length;
    fireEvent.click(cell(picked));
    expect(apply).toBeEnabled();
    const end = new Date(picked);
    end.setDate(16);
    fireEvent.click(cell(end));
    const [startHour] = within(timeField(dialog, 'Start time')).getAllByRole('spinbutton');
    fireEvent.keyDown(startHour, { key: 'ArrowUp' });
    expect(feedSource.searchFeed.mock.calls).toHaveLength(reads);

    fireEvent.click(apply);

    picked.setHours(1, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    await waitFor(() => expect(lastQuery()).toMatchObject({ fromMs: picked.getTime(), toMs: end.getTime() }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('applies one pressed day as a one-day range, drops an unapplied pick on Esc, and clears the range and closes from Clear', async () => {
    await renderChart();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let dialog = await openPicker();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Today/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ fromMs: today.getTime() }));
    expect(lastQuery()?.toMs).toBeLessThanOrEqual(Date.now());

    dialog = await openPicker();
    fireEvent.keyDown(within(timeField(dialog, 'Start time')).getAllByRole('spinbutton')[0], { key: 'ArrowUp' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    dialog = await openPicker();
    expect(timeField(dialog, 'Start time')).toHaveTextContent(/12\D*00\D*AM/);
    expect(lastQuery()).toMatchObject({ fromMs: today.getTime() });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(lastQuery()).toMatchObject({ toMs: 0 }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear time range' })).not.toBeInTheDocument();
  });

  it('shows the chart failure alert instead of bars, and draws them after Try again', async () => {
    feedSource.getOverview.mockRejectedValueOnce(new Error('down')).mockResolvedValue({ ...buildOverview([]), slots });
    feedSource.searchFeed.mockResolvedValue(page(1, 1));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(bars()).toHaveLength(3));
    expect(screen.queryByText('Activity could not read its chart and counts')).not.toBeInTheDocument();
  });
});
