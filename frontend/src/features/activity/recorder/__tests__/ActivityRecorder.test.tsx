import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityRecorderEntry } from '../../activity-source/activity.types';
import type { ActivityRecorderPage } from '../../history-source/history.types';
import type { HistorySource } from '../../history-source/history-source.types';
import { ActivityRecorder } from '../ActivityRecorder';

/** The source the component reads, swapped per test. */
const sourceState: { source: HistorySource; push: (row: ActivityRecorderEntry) => void } = {
  source: createSource(() => new Promise(() => undefined)),
  push: () => undefined,
};

vi.mock('../../history-source/history-source.helpers', () => ({
  createHistorySource: () => sourceState.source,
}));

/** A source whose recorder read the test controls; its live listener is exposed on `sourceState.push`. */
function createSource(listRecorder: HistorySource['listRecorder']): HistorySource {
  return {
    searchHistory: vi.fn(),
    listRecorder,
    subscribeRecorder: (listener) => {
      sourceState.push = listener;
      return () => undefined;
    },
  };
}

/** A request row with only the fields a case names. */
function request(id: string, overrides: Partial<ActivityRecorderEntry> = {}): ActivityRecorderEntry {
  return {
    source: 'request',
    id,
    atMs: 0,
    kind: 'http',
    route: `/api/${id}`,
    httpStatus: 200,
    outcome: 'ok',
    durationMs: 12,
    deviceName: 'Pixel',
    errorCode: '',
    domain: '',
    level: '',
    eventType: '',
    message: '',
    correlationId: '',
    ...overrides,
  };
}

/** A page of `count` requests. */
function page(count: number, nextCursor = ''): ActivityRecorderPage {
  return { entries: Array.from({ length: count }, (_unused, index) => request(`r-${index}`)), nextCursor };
}

/** Renders the recorder over `listRecorder` and returns the back spy. */
function renderRecorder(listRecorder: HistorySource['listRecorder']) {
  sourceState.source = createSource(listRecorder);
  const onBack = vi.fn();
  render(<ActivityRecorder onBack={onBack} />);
  return onBack;
}

describe('ActivityRecorder', () => {
  it('shows only the skeleton status region while loading', () => {
    renderRecorder(() => new Promise(() => undefined));

    const status = screen.getByRole('status', { name: 'Loading the recorder' });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getAllByTestId('activity-recorder-skeleton-row')).toHaveLength(8);
    expect(document.querySelectorAll('[data-recorder-row]')).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing recorded in the last 2 hours')).not.toBeInTheDocument();
  });

  it('shows only the failure alert when the read fails, and retries', async () => {
    const listRecorder = vi.fn<HistorySource['listRecorder']>().mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce(page(1));
    renderRecorder(listRecorder);

    expect(await screen.findByText('The recorder could not be read')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-recorder-row]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('/api/r-0')).toBeInTheDocument();
    expect(screen.queryByText('The recorder could not be read')).not.toBeInTheDocument();
  });

  it('shows only the empty state when nothing was recorded, until a live row arrives', async () => {
    renderRecorder(() => Promise.resolve(page(0)));

    expect(await screen.findByText('Nothing recorded in the last 2 hours')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Recorded requests and events' })).not.toBeInTheDocument();

    act(() => sourceState.push(request('live-1', { httpStatus: 503, outcome: 'error' })));

    expect(screen.getByText('/api/live-1')).toBeInTheDocument();
    expect(screen.getByText('503')).toBeInTheDocument();
    expect(screen.queryByText('Nothing recorded in the last 2 hours')).not.toBeInTheDocument();
  });

  it('renders one batch of rows even when more are held', async () => {
    renderRecorder(() => Promise.resolve(page(50, 'older')));
    await screen.findByText('/api/r-0');

    act(() => {
      for (let index = 0; index < 30; index += 1) {
        sourceState.push(request(`live-${index}`));
      }
    });

    expect(document.querySelectorAll('[data-recorder-row]')).toHaveLength(50);
    expect(screen.getByText('/api/live-29')).toBeInTheDocument();
    expect(screen.queryByText('/api/r-49')).not.toBeInTheDocument();
  });

  it('grows the window near the bottom of its scroll container', async () => {
    renderRecorder(() => Promise.resolve(page(50, '')));
    await screen.findByText('/api/r-0');
    act(() => {
      for (let index = 0; index < 20; index += 1) {
        sourceState.push(request(`live-${index}`));
      }
    });
    const scroller = screen.getByTestId('activity-recorder-scroll');
    Object.defineProperties(scroller, { scrollTop: { value: 1000 }, clientHeight: { value: 400 }, scrollHeight: { value: 1400 } });

    fireEvent.scroll(scroller);

    expect(document.querySelectorAll('[data-recorder-row]')).toHaveLength(70);
  });

  it('calls onBack from the back action', async () => {
    const onBack = renderRecorder(() => Promise.resolve(page(1)));
    await screen.findByText('/api/r-0');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
