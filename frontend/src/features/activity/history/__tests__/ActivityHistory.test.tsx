import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityCalendarDay, ActivityHistoryView, ActivityLedgerDay, ActivityLedgerLine } from '../../history-source/history.types';
import type { HistorySource } from '../../history-source/history-source.types';
import { ActivityHistory } from '../ActivityHistory';

/** The source the component reads, swapped per test. */
const sourceState: { source: HistorySource } = { source: createSource(() => new Promise(() => undefined)) };

vi.mock('../../history-source/history-source.helpers', () => ({
  createHistorySource: () => sourceState.source,
}));

/** A source whose History read the test controls. */
function createSource(searchHistory: HistorySource['searchHistory']): HistorySource {
  return { searchHistory, listRecorder: vi.fn(), subscribeRecorder: () => () => undefined };
}

/** Local midnight of 2026-10-`day`. */
function dayMs(day: number): number {
  return new Date(2026, 9, day).getTime();
}

/** A ledger line with only the fields a case names. */
function line(id: string, overrides: Partial<ActivityLedgerLine> = {}): ActivityLedgerLine {
  return {
    kind: 'change',
    id,
    atMs: new Date(2026, 9, 18, 17, 31).getTime(),
    phoneAtMs: undefined,
    domain: 'anime',
    source: 'mobile',
    level: '',
    title: `Line ${id}`,
    detail: 'episode 10 → 11',
    correlationId: '',
    marks: [],
    ...overrides,
  };
}

/** Calendar Oct 10-18: before recording on Oct 10-11, a gap on Oct 14-15, an incident on Oct 16. */
const CALENDAR: readonly ActivityCalendarDay[] = Array.from({ length: 9 }, (_unused, index) => {
  const day = 10 + index;
  const hasData = day >= 12 && (day < 14 || day > 15);
  return { dayStartMs: dayMs(day), total: hasData ? 40 : 0, hasData, hasIncident: day === 16 };
});

/** A History page holding the given days. */
function view(days: readonly ActivityLedgerDay[], calendar: readonly ActivityCalendarDay[] = CALENDAR, nextCursor = ''): ActivityHistoryView {
  return { calendar, days, nextCursor };
}

/** Renders History over `searchHistory` and returns the pairing spy. */
function renderHistory(searchHistory: HistorySource['searchHistory']) {
  sourceState.source = createSource(searchHistory);
  const onPairPhone = vi.fn();
  render(<ActivityHistory onPairPhone={onPairPhone} />);
  return onPairPhone;
}

describe('ActivityHistory', () => {
  it('shows only the skeleton status region while loading', () => {
    renderHistory(() => new Promise(() => undefined));

    expect(screen.getByRole('status', { name: 'Loading History' })).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('activity-history-skeleton-calendar').children).toHaveLength(90);
    expect(screen.getAllByTestId('activity-history-skeleton-row')).toHaveLength(6);
    expect(document.querySelectorAll('[data-history-line], [data-calendar-day]')).toHaveLength(0);
    expect(screen.queryByText('Activity could not read its history')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing recorded yet')).not.toBeInTheDocument();
  });

  it('shows only the failure alert when the read fails, and retries', async () => {
    const search = vi.fn<HistorySource['searchHistory']>().mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce(view([{ dayStartMs: dayMs(18), lines: [line('a')] }]));
    renderHistory(search);

    expect(await screen.findByText('Activity could not read its history')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-history-line]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Line a')).toBeInTheDocument();
    expect(screen.queryByText('Activity could not read its history')).not.toBeInTheDocument();
  });

  it('shows only the first-run empty state when nothing was ever recorded', async () => {
    const empty = CALENDAR.map((day) => ({ ...day, total: 0, hasData: false, hasIncident: false }));
    const onPairPhone = renderHistory(() => Promise.resolve(view([], empty)));

    expect(await screen.findByText('Nothing recorded yet')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pair a phone' }));
    expect(onPairPhone).toHaveBeenCalledTimes(1);
  });

  it('draws the calendar with outlines before recording, gaps, and incident rings', async () => {
    renderHistory(() => Promise.resolve(view([{ dayStartMs: dayMs(18), lines: [line('a')] }])));

    const calendar = await screen.findByRole('img', { name: /^Last 90 days: 200 requests over 5 days\. 1 day had an incident\. 2 days have no data\./ });
    const states = [...calendar.querySelectorAll('[data-calendar-day]')].map((cell) => cell.getAttribute('data-calendar-day'));
    expect(states).toEqual(['before', 'before', 'data', 'data', 'gap', 'gap', 'data', 'data', 'data']);
    expect(calendar.querySelectorAll('.ring-danger')).toHaveLength(1);
  });

  it('renders day groups with their chips, both times of a late phone fact, and the gap block', async () => {
    const late = line('late', { phoneAtMs: new Date(2026, 9, 18, 17, 2).getTime(), marks: ['arrived_late', 'recovered'] });
    renderHistory(() => Promise.resolve(view([{ dayStartMs: dayMs(18), lines: [late] }, { dayStartMs: dayMs(13), lines: [line('old', { marks: ['incident'] })] }])));

    const today = await screen.findByRole('region', { name: 'Sun, Oct 18' });
    expect(within(today).getByText('17:31')).toBeInTheDocument();
    expect(within(today).getByText('Phone 17:02')).toBeInTheDocument();
    expect(within(today).getByText('Arrived late')).toBeInTheDocument();
    expect(within(today).getByText('Recovered')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Tue, Oct 13' })).getByText('Incident')).toBeInTheDocument();
    expect(screen.getByText('No data · from Wed, Oct 14 to Thu, Oct 15')).toBeInTheDocument();
    expect(screen.queryByText('Unclean stop')).not.toBeInTheDocument();
  });

  it('renders one page of lines, not the whole history', async () => {
    const lines = Array.from({ length: 50 }, (_unused, index) => line(`l-${index}`));
    renderHistory(() => Promise.resolve(view([{ dayStartMs: dayMs(18), lines }], CALENDAR, 'older')));

    await screen.findByText('Line l-0');

    expect(document.querySelectorAll('[data-history-line]')).toHaveLength(50);
    expect(document.querySelectorAll('[data-history-gap]')).toHaveLength(0);
  });

  it('loads older days near the bottom of the day list', async () => {
    const search = vi
      .fn<HistorySource['searchHistory']>()
      .mockResolvedValueOnce(view([{ dayStartMs: dayMs(18), lines: [line('a')] }], CALENDAR, 'c-1'))
      .mockResolvedValueOnce(view([{ dayStartMs: dayMs(17), lines: [line('b')] }], [], ''));
    renderHistory(search);
    await screen.findByText('Line a');
    const scroller = screen.getByTestId('activity-history-scroll');
    Object.defineProperties(scroller, { scrollTop: { value: 1000 }, clientHeight: { value: 400 }, scrollHeight: { value: 1400 } });

    fireEvent.scroll(scroller);

    expect(await screen.findByText('Line b')).toBeInTheDocument();
    expect(search).toHaveBeenLastCalledWith('all', 'c-1', 50);
  });

  it('narrows to a filter, shows the filtered empty state, and returns to All', async () => {
    const search = vi
      .fn<HistorySource['searchHistory']>()
      .mockResolvedValueOnce(view([{ dayStartMs: dayMs(18), lines: [line('a')] }]))
      .mockResolvedValueOnce(view([]))
      .mockResolvedValueOnce(view([{ dayStartMs: dayMs(18), lines: [line('a')] }]));
    renderHistory(search);
    await screen.findByText('Line a');

    fireEvent.click(screen.getByRole('radio', { name: 'Season' }));

    expect(await screen.findByText('No activity for this filter')).toBeInTheDocument();
    expect(search).toHaveBeenNthCalledWith(2, 'season', '', 50);
    expect(screen.queryByText('Line a')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));

    expect(await screen.findByText('Line a')).toBeInTheDocument();
    expect(search).toHaveBeenNthCalledWith(3, 'all', '', 50);
  });

  it('shows the calendar with a quiet note when only polling was recorded', async () => {
    renderHistory(() => Promise.resolve(view([])));

    expect(await screen.findByText('No changes in the last 90 days')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-history-line]')).toHaveLength(0);
  });
});
