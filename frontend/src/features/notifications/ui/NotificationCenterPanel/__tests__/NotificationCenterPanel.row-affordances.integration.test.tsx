import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationPage, NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { NotificationCenterPanel } from '../NotificationCenterPanel';

afterEach(cleanup);

/**
 * The unread record the master list must render every affordance for: a
 * severity chip, an unread mark, the names of the things it is about, and a
 * count saying those two names do not account for all three of them.
 */
const RICH_ROW: NotificationRow = {
  id: 11,
  createdAtMs: 1_700_000_000_000,
  title: 'Download stopped before the season finished',
  body: '',
  level: 'warning',
  source: 'download',
  actionCount: 0,
  rowCount: 3,
  subjects: ['Tensei shitara Slime Datta Ken 4th Season', 'Tenmaku no Jaadugar'],
};

/**
 * The already-read record carrying neither subjects nor a row count -- the
 * row that must keep rendering exactly as it does today, growing no empty
 * chip, no empty second line, and no `0` badge.
 */
const BARE_ROW: NotificationRow = {
  id: 12,
  createdAtMs: 1_600_000_000_000,
  title: 'Device sync needs attention',
  body: '',
  level: 'success',
  source: 'devices',
  actionCount: 0,
  readAtMs: 1_700_000_500_000,
};

/**
 * Builds a `NotificationCenterSource` whose list read returns the given rows
 * and whose every other method is an inert stub -- no test here opens a
 * record, so the detail pane never reads.
 * @param items The rows the master list is seeded with.
 * @returns A `NotificationCenterSource` double.
 */
function makeSource(items: readonly NotificationRow[]): NotificationCenterSource {
  const page: NotificationPage = { items, appliedLimit: 25, totalEver: items.length, degraded: false };

  return {
    listNotifications: vi.fn().mockResolvedValue(page),
    getNotification: vi.fn(),
    getUnreadCount: vi.fn().mockResolvedValue(1),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn(),
  };
}

/**
 * Renders the real panel over a seeded source and waits for the first page to
 * land, so every assertion below runs against rows the list actually painted.
 * @param items The rows the master list is seeded with.
 */
async function renderSeededList(items: readonly NotificationRow[]): Promise<void> {
  render(<NotificationCenterPanel source={makeSource(items)} />);
  await screen.findByText(items[0]?.title ?? '');
}

describe('NotificationCenterPanel master list row affordances (integration)', () => {
  it('renders the row severity as a chip beside the title', async () => {
    await renderSeededList([RICH_ROW, BARE_ROW]);

    // Scoped to the grid: the level filter dropdown beside the table renders
    // the same four words into React Aria's hidden autofill <select>, so an
    // unscoped text query would match the filter rather than the row.
    // Written as literals: asserting against SEVERITY_TO_CHIP_COLOR or
    // formatLevelLabel would still pass with either emptied (CLAUDE.md #16).
    const table = within(screen.getByRole('grid'));

    expect(table.getByText('Warning')).toBeInTheDocument();
    expect(table.getByText('Success')).toBeInTheDocument();
  });

  it('grows no chip at all for a producer that reported no level', async () => {
    // An empty level would render a chip labelled with the empty string: a
    // blank pill no text query can see. Element presence is the only check
    // that tells "renders nothing" apart from "renders nothing visible".
    await renderSeededList([{ ...BARE_ROW, level: '' }]);

    expect(screen.queryByTestId('notification-table-level-chip')).not.toBeInTheDocument();
  });

  it('marks only the unread row, leaving an already-read one unmarked', async () => {
    // Two rows, one of each state: exactly one mark must exist. Counting is
    // what proves the read row carries none -- a plain presence check on the
    // unread row would pass even if both were marked.
    await renderSeededList([RICH_ROW, BARE_ROW]);

    expect(screen.getAllByRole('img', { name: 'Unread' })).toHaveLength(1);
  });

  it('carries no indicator at all on an already-read row, not a dimmed one', async () => {
    await renderSeededList([BARE_ROW]);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('emphasizes an unread title and de-emphasizes a read one', async () => {
    // The dot is not the only thing the artboard changes with read state: the
    // title itself goes from heavy foreground to muted once the record has
    // been seen, and nothing else in the row encodes that.
    await renderSeededList([RICH_ROW, BARE_ROW]);

    expect(screen.getByText(RICH_ROW.title)).toHaveClass('font-semibold');
    expect(screen.getByText(BARE_ROW.title)).toHaveClass('text-default-500');
  });

  it('names each row selection checkbox after its own notification', async () => {
    // A column of checkboxes all called "Select" is unusable by keyboard or
    // screen reader once more than one row is listed. Matched by prefix
    // because React Aria appends the whole row's content to a row checkbox's
    // accessible name; the label under test is the part it opens with.
    await renderSeededList([RICH_ROW, BARE_ROW]);

    expect(screen.getByRole('checkbox', { name: /^Select Download stopped before the season finished\b/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Select Device sync needs attention\b/ })).toBeInTheDocument();
  });

  it('names the things a row is about under its title', async () => {
    await renderSeededList([RICH_ROW, BARE_ROW]);

    expect(screen.getByTestId('notification-table-subjects')).toHaveTextContent(
      'Tensei shitara Slime Datta Ken 4th Season · Tenmaku no Jaadugar',
    );
  });

  it('badges the count when the named subjects do not account for every thing the row stands for', async () => {
    await renderSeededList([RICH_ROW, BARE_ROW]);

    expect(screen.getByTestId('notification-table-row-count')).toHaveTextContent('3×');
  });

  it('grows no subject line, no count badge and no zero for a row carrying neither', async () => {
    await renderSeededList([BARE_ROW]);

    // Element-presence checks, not text checks: an empty <p> and a `0` chip
    // both look identical to no element at all through a text query.
    expect(screen.queryByTestId('notification-table-subjects')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-table-row-count')).not.toBeInTheDocument();
  });

  it('badges no count when the subject line already names every thing the row stands for', async () => {
    const fullyNamed: NotificationRow = { ...RICH_ROW, rowCount: 2 };

    await renderSeededList([fullyNamed]);

    expect(screen.getByTestId('notification-table-subjects')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-table-row-count')).not.toBeInTheDocument();
  });

  it('badges the count for a row standing for several unnamed things', async () => {
    const unnamed: NotificationRow = { ...RICH_ROW, subjects: undefined, rowCount: 4 };

    await renderSeededList([unnamed]);

    expect(screen.getByTestId('notification-table-row-count')).toHaveTextContent('4×');
    expect(screen.queryByTestId('notification-table-subjects')).not.toBeInTheDocument();
  });
});
