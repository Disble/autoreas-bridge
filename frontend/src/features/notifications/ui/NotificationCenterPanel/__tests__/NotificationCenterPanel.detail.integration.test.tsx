import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationActionResult, NotificationDetail, NotificationPage } from '../../../../../shared/contracts/notification-center.types';
import { getNotificationStoreState, resetNotificationStore } from '../../../../../shared/store/notification-store/notification-store.helpers';
import { NotificationCenterPanel } from '../NotificationCenterPanel';

afterEach(cleanup);
beforeEach(resetNotificationStore);

/** The one row the master list returns in every case here. */
const LISTED_PAGE: NotificationPage = {
  items: [{ id: 7, createdAtMs: 1000, title: 'Download run finished', body: 'Two of three animes completed', level: 'warning', source: 'download', actionCount: 1 }],
  appliedLimit: 25,
  totalEver: 1,
  degraded: false,
};

/** The record `getNotification(7)` resolves to: one detail row carrying one action token. */
const RECORD: NotificationDetail = {
  id: 7,
  createdAtMs: 1000,
  title: 'Download run finished',
  body: 'Two of three animes completed',
  level: 'warning',
  source: 'download',
  actionCount: 1,
  rows: [{ refType: 'anime', refId: 'a-4417', name: 'Youjo Senki II', status: 'stopped', detail: 'episode 16 failed on every hoster', actionIds: ['act-1'] }],
  actions: [{ id: 'act-1', rowRef: 'a-4417', label: 'Run this anime again', intent: 'download.run_anime' }],
};

/**
 * Builds a source whose list and detail reads are wired for real, with every
 * other method a stub the caller may override.
 * @param overrides Methods to replace on the returned source.
 * @returns A `NotificationCenterSource` double.
 */
function makeSource(overrides: Partial<NotificationCenterSource> = {}): NotificationCenterSource {
  return {
    listNotifications: vi.fn().mockResolvedValue(LISTED_PAGE),
    getNotification: vi.fn().mockResolvedValue({ found: true, item: RECORD, degraded: false }),
    getUnreadCount: vi.fn().mockResolvedValue(1),
    markRead: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    markUnread: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 1, degraded: false }),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn(),
    ...overrides,
  };
}

/**
 * Presses the master-list row for the seeded record, waiting for it to render
 * first. Presses the title cell rather than the row element so the assertion
 * describes what a user does, and never touches the selection checkbox --
 * selecting a row for a bulk action and opening it are different intents.
 */
async function pressListedRow(): Promise<void> {
  const title = await screen.findByText('Download run finished');
  fireEvent.click(title);
}

describe('NotificationCenterPanel -> NotificationDetail (integration)', () => {
  it('opens the pressed record in the detail pane', async () => {
    const source = makeSource();

    render(<NotificationCenterPanel source={source} />);
    await pressListedRow();

    // The detail block, not the list row: the row list is what only the
    // detail renders, so asserting on it cannot pass against the master list.
    await waitFor(() => expect(screen.getByText('Youjo Senki II')).toBeInTheDocument());
    expect(screen.getByText('episode 16 failed on every hoster')).toBeInTheDocument();
    expect(source.getNotification).toHaveBeenCalledWith(7);
  });

  it('prompts for a selection before any record has been opened', () => {
    render(<NotificationCenterPanel source={makeSource()} />);

    expect(screen.getByText('Select a notification to see its details.')).toBeInTheDocument();
  });

  it('keeps selecting a row and opening it as separate intents', async () => {
    // Selection feeds the bulk-action bar; opening feeds the detail pane.
    // React Aria separates the two, but nothing in this repo pinned that, and
    // if it ever stopped holding, selecting five rows for a bulk archive would
    // fire five detail reads and five mark-reads behind the user's back.
    const source = makeSource();

    render(<NotificationCenterPanel source={source} />);
    await screen.findByText('Download run finished');

    // Index 1: index 0 is the header's "select all".
    fireEvent.click(screen.getAllByRole('checkbox')[1] as HTMLElement);

    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
    expect(source.getNotification).not.toHaveBeenCalled();
    expect(source.markRead).not.toHaveBeenCalled();
  });

  it('marks the record read when it is opened', async () => {
    const markRead = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false });
    const source = makeSource({ markRead });

    render(<NotificationCenterPanel source={source} />);
    await pressListedRow();

    await waitFor(() => expect(markRead).toHaveBeenCalledWith([7]));
  });

  it('executes a row action against the owning record when its button is pressed', async () => {
    const executeAction = vi.fn().mockResolvedValue({ executed: true } satisfies Partial<NotificationActionResult> as NotificationActionResult);
    const source = makeSource({ executeAction });

    render(<NotificationCenterPanel source={source} />);
    await pressListedRow();

    fireEvent.click(await screen.findByRole('button', { name: 'Run this anime again' }));

    await waitFor(() => expect(executeAction).toHaveBeenCalledWith(7, 'act-1'));
  });

  // Opening a record marks it read; pressing "Mark unread" inside that very
  // pane has to survive it. This is the obvious way the feature breaks: a pane
  // that re-marked its open record read would put the badge straight back down
  // and quietly undo the press.
  it('leaves the record unread after mark unread, without the open pane re-marking it read', async () => {
    const source = makeSource();

    render(<NotificationCenterPanel source={source} />);
    await pressListedRow();
    await waitFor(() => expect(source.markRead).toHaveBeenCalledWith([7]));
    await waitFor(() => expect(getNotificationStoreState().unreadCount).toBe(0));

    fireEvent.click(await screen.findByRole('button', { name: 'Mark unread' }));

    await waitFor(() => expect(source.markUnread).toHaveBeenCalledWith([7]));
    // The count is the assertion, not the call: it must CLIMB, and it must
    // still be up once everything the press set in motion has settled.
    await waitFor(() => expect(getNotificationStoreState().unreadCount).toBe(1));
    expect(source.markRead).toHaveBeenCalledTimes(1);
    expect(getNotificationStoreState().unreadCount).toBe(1);
  });

  // The header subtitle and the nav rail badge read the same store value, so
  // asserting the rendered copy proves the number reached a surface the user
  // can see rather than only the store.
  it('shows the climbed count in the page subtitle after mark unread', async () => {
    render(<NotificationCenterPanel source={makeSource()} />);
    await pressListedRow();
    await waitFor(() => expect(screen.getByText(/No unread/)).toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: 'Mark unread' }));

    await waitFor(() => expect(screen.getByText(/1 unread/)).toBeInTheDocument());
  });

  // Every read-state hook below was already correct on its own. What was
  // missing was the wiring between them: the selection bar got its
  // `onMutated` and the pane got nothing, so the pane's verbs moved the store
  // and left the row beside them telling the opposite story. These press the
  // real buttons through the real panel, which is the only level a forgotten
  // prop shows up at.
  it('clears the master-list unread dot when a record is opened, and restores it on mark unread', async () => {
    render(<NotificationCenterPanel source={makeSource()} />);

    expect(await screen.findByRole('img', { name: 'Unread' })).toBeInTheDocument();

    await pressListedRow();
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Unread' })).not.toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: 'Mark unread' }));

    await waitFor(() => expect(screen.getByRole('img', { name: 'Unread' })).toBeInTheDocument());
  });

  it('leaves the unread dot alone when the opening mark-read degraded', async () => {
    const markRead = vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: true });

    render(<NotificationCenterPanel source={makeSource({ markRead })} />);
    await pressListedRow();

    await waitFor(() => expect(markRead).toHaveBeenCalledWith([7]));
    // The store never recorded the read, so the list must not claim it did.
    expect(screen.getByRole('img', { name: 'Unread' })).toBeInTheDocument();
  });

  it('drops the row from the master list when it is archived from the detail pane', async () => {
    // The reported defect, end to end: the store archived the record and the
    // active list went on showing it. `archive` fires the runtime event here
    // exactly as `App.ArchiveNotifications` does after its store write.
    const archivedListeners: ((recordIds: readonly number[]) => void)[] = [];
    const archive = vi.fn().mockImplementation((ids: readonly number[]) => {
      for (const listener of archivedListeners) {
        listener(ids);
      }
      return Promise.resolve({ affected: ids.length, unreadCount: 0, degraded: false });
    });
    const pushSource = {
      subscribe: () => () => undefined,
      subscribeArchived(listener: (recordIds: readonly number[]) => void) {
        archivedListeners.push(listener);
        return () => {
          archivedListeners.splice(archivedListeners.indexOf(listener), 1);
        };
      },
      subscribeNavigate: () => () => undefined,
    };

    render(<NotificationCenterPanel pushSource={pushSource} source={makeSource({ archive })} />);
    await pressListedRow();

    // The title renders twice while the record is open: once as the master-list
    // row, once as the detail header. Archiving must take the ROW away and
    // leave the pane showing what the user just acted on, so the count is what
    // separates the two -- plain absence would demand the pane clear as well.
    await waitFor(() => expect(screen.getAllByText('Download run finished')).toHaveLength(2));

    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith([7]));
    await waitFor(() => expect(screen.getAllByText('Download run finished')).toHaveLength(1));
  });

  it('shows the refusal reason when the pressed action is refused', async () => {
    const executeAction = vi.fn().mockResolvedValue({ executed: false, reason: 'target_missing' } satisfies Partial<NotificationActionResult> as NotificationActionResult);
    const source = makeSource({ executeAction });

    render(<NotificationCenterPanel source={source} />);
    await pressListedRow();

    fireEvent.click(await screen.findByRole('button', { name: 'Run this anime again' }));

    // The reason must reach the user as words, not as the wire token. Written
    // as a literal on purpose: asserting against REFUSAL_REASON_MESSAGES would
    // pass even if that map were emptied (CLAUDE.md #16).
    await waitFor(() => expect(screen.getByText('The thing this action pointed at is gone.')).toBeInTheDocument());
    expect(screen.queryByText('target_missing')).not.toBeInTheDocument();
  });
});
