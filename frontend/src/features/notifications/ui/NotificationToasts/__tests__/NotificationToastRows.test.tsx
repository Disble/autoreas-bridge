import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppNotificationRow } from '../../../../../shared/contracts/app-notification.types';
import { NotificationToastRows } from '../NotificationToastRows';
import { useNotificationToastCovers } from '../use-notification-toast-covers';

afterEach(cleanup);

/** Builds one toast row, defaulting to the anime shape every producer attaches. */
function buildRow(overrides: Partial<AppNotificationRow> = {}): AppNotificationRow {
  return { refType: 'anime', refId: 'a-1', name: 'Frieren', status: 'downloaded', detail: 'Episode 19', ...overrides };
}

describe('NotificationToastRows', () => {
  // The whole point of the block: a toast that says "1 episode(s) downloaded" without naming the
  // anime is the same defect the master list had before it grew subjects.
  it('names each anime and what happened to it', () => {
    render(<NotificationToastRows rows={[buildRow()]} />);

    expect(screen.getByText('Frieren')).toBeInTheDocument();
    expect(screen.getByText('Episode 19')).toBeInTheDocument();
  });

  // Table C: the toast renders rows as identity and offers no per-row verb.
  it('offers no per-row button', () => {
    render(<NotificationToastRows rows={[buildRow(), buildRow({ refId: 'a-2', name: 'Bocchi' })]} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  // A run can touch nine anime, and a nine-row card would outlive its own timeout on screen. The
  // Center record carries all of them.
  it('bounds what it names and says how many it left out', () => {
    const rows = Array.from({ length: 6 }, (_, index) => buildRow({ refId: `a-${index}`, name: `Anime ${index}` }));

    render(<NotificationToastRows rows={rows} />);

    expect(screen.getByText('Anime 0')).toBeInTheDocument();
    expect(screen.queryByText('Anime 4')).not.toBeInTheDocument();
    expect(screen.getByText('+3 more')).toBeInTheDocument();
  });

  // A collapsed row stands in for anime it does not name, so borrowing the cover-and-name anatomy
  // would show a nameless card with placeholder art.
  it('renders a collapsed row as its own summary line', () => {
    render(<NotificationToastRows rows={[buildRow({ collapsedCount: 6, name: '', detail: '6 anime finished without incident' })]} />);

    expect(screen.getByText('6 anime finished without incident')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  // "+0 more" is a lie dressed as a summary: it claims something was left out when nothing was.
  it('says nothing about overflow when it named everything', () => {
    const rows = Array.from({ length: 3 }, (_, index) => buildRow({ refId: `a-${index}`, name: `Anime ${index}` }));

    render(<NotificationToastRows rows={rows} />);

    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it('draws the resolved cover for a row that has one', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,AAA', source: 'cover' });

    render(<NotificationToastRows coverSource={{ getAnimeCover }} rows={[buildRow()]} />);

    await waitFor(() => expect(screen.getByRole('img', { name: 'Frieren' })).toHaveAttribute('src', 'data:image/png;base64,AAA'));
  });

  it('draws the placeholder for a row whose cover never arrives', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });

    render(<NotificationToastRows coverSource={{ getAnimeCover }} rows={[buildRow()]} />);

    await waitFor(() => expect(getAnimeCover).toHaveBeenCalledWith('a-1'));
    expect(screen.queryByRole('img', { name: 'Frieren' })).not.toBeInTheDocument();
  });

  it('renders nothing at all when there is nothing to name', () => {
    const { container } = render(<NotificationToastRows rows={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('useNotificationToastCovers', () => {
  it('resolves the cover for each anime row, keyed by ref id', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,AAA', source: 'cover' });

    const { result } = renderHook(() => useNotificationToastCovers([buildRow()], { getAnimeCover }));

    await waitFor(() => expect(result.current.get('a-1')).toBe('data:image/png;base64,AAA'));
  });

  // A toast has no loading state to show: it appears, and whatever resolved by paint time is what
  // it draws. A cover that never arrives must therefore look exactly like one that does not exist.
  it('records nothing when the cover never resolves', async () => {
    const getAnimeCover = vi.fn().mockRejectedValue(new Error('no cover'));

    const { result } = renderHook(() => useNotificationToastCovers([buildRow()], { getAnimeCover }));

    await waitFor(() => expect(getAnimeCover).toHaveBeenCalledWith('a-1'));
    expect(result.current.get('a-1')).toBeUndefined();
  });

  it('records nothing for a row whose anime has no cover art', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });

    const { result } = renderHook(() => useNotificationToastCovers([buildRow()], { getAnimeCover }));

    await waitFor(() => expect(getAnimeCover).toHaveBeenCalledWith('a-1'));
    expect(result.current.get('a-1')).toBeUndefined();
  });

  // Only anime rows have a cover asset. Asking for one by an episode or link id would spend a
  // round trip to be told no.
  it('asks for nothing on a row that is not an anime', async () => {
    const getAnimeCover = vi.fn();

    renderHook(() => useNotificationToastCovers([buildRow({ refType: 'link', refId: 'l-1' })], { getAnimeCover }));

    await waitFor(() => expect(getAnimeCover).not.toHaveBeenCalled());
  });

  // A source with no binding at all is the browser/degraded case: it must render placeholders
  // rather than throwing on an undefined call.
  it('asks nothing of a source that offers no cover binding', () => {
    const { result } = renderHook(() => useNotificationToastCovers([buildRow()], {}));

    expect(result.current.size).toBe(0);
  });

  // A row with no id addresses no anime, so the lookup would spend a round trip on "".
  it('asks for nothing on a row carrying no id', async () => {
    const getAnimeCover = vi.fn();

    renderHook(() => useNotificationToastCovers([buildRow({ refId: '' })], { getAnimeCover }));

    await waitFor(() => expect(getAnimeCover).not.toHaveBeenCalled());
  });

  it('asks once per anime however often it re-renders', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,AAA', source: 'cover' });
    const rows = [buildRow()];

    const { rerender } = renderHook(() => useNotificationToastCovers(rows, { getAnimeCover }));
    rerender();
    rerender();

    await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
  });
});
