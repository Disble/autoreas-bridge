import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationDetail as NotificationDetailDTO } from '../../../../../shared/contracts/notification-center.types';
import { NotificationDetail } from '../NotificationDetail';

vi.mock('../use-notification-detail-covers', () => ({
  useNotificationDetailCovers: vi.fn().mockReturnValue(new Map()),
}));

afterEach(cleanup);

/**
 * Builds the record the edge cases below are read from. Mirrors the fixture in
 * `NotificationDetail.test.tsx`, plus the identifying fields the canvas puts in
 * the pane's metadata footer.
 * @param overrides Fields to replace on the fixture.
 * @returns A `NotificationDetail` fixture.
 */
function buildDetail(overrides: Partial<NotificationDetailDTO> = {}): NotificationDetailDTO {
  return {
    actionCount: 1,
    actions: [{ id: 'act-open', label: 'Open Downloads', intent: 'navigation.open' }],
    body: 'Everything after the failed episode was never attempted.',
    correlationId: 'run-8f21c4',
    createdAtMs: 1_700_000_000_000,
    id: 1,
    level: 'warning',
    rows: [{ detail: 'Episode 3 failed', name: 'Some Anime', refId: 'anime-1', refType: 'anime', status: 'Stopped' }],
    source: 'download',
    title: 'Download stopped before the season finished',
    ...overrides,
  };
}

// Every assertion here traces to `design-canvas/Main.dc.html`, the artboard the
// user approved before development began. The pane's interior -- header, the
// four-part row, the collapsed line -- already matches it. Everything at its
// EDGES is missing: how you identify the record, and how you leave the pane.
describe('NotificationDetail edges (design-canvas/Main.dc.html)', () => {
  it('shows the correlation id, which is the only thing tying a notification to its run', () => {
    render(<NotificationDetail detail={buildDetail()} />);

    expect(screen.getByText('run-8f21c4')).toBeInTheDocument();
  });

  // The canvas footer's other half. `kind` reached the wire with the backend
  // half of L.4.2, so the assertion that was deferred lands here now. `source`
  // is not it: `source` is "download", the bounded context; `kind` is the
  // specific event within it.
  it('shows the kind, which names the event the notification is actually about', () => {
    render(<NotificationDetail detail={buildDetail({ kind: 'download.run_stopped_early' })} />);

    expect(screen.getByText('download.run_stopped_early')).toBeInTheDocument();
  });

  it('renders a whole-notification action instead of silently dropping it', () => {
    // The action carries no `rowRef`, so it is about the notification, not a
    // row. `resolveRowActions` resolves strictly from `row.actionIds`, so today
    // this action is fetched, passed down and discarded without a trace -- the
    // same silent-drop defect this change fixed in the toast layer.
    render(<NotificationDetail detail={buildDetail()} />);

    expect(screen.getByRole('button', { name: 'Open Downloads' })).toBeInTheDocument();
  });

  it('does not render a whole-notification action twice when a row also has one', () => {
    // Guards the obvious wrong fix: rendering every action in `detail.actions`
    // at the footer, which would duplicate each row's own button below it.
    render(
      <NotificationDetail
        detail={buildDetail({
          actions: [
            { id: 'act-open', label: 'Open Downloads', intent: 'navigation.open' },
            { id: 'act-row', label: 'Run this anime again', intent: 'download.run_anime', rowRef: 'anime-1' },
          ],
          rows: [{ actionIds: ['act-row'], detail: 'Episode 3 failed', name: 'Some Anime', refId: 'anime-1', refType: 'anime', status: 'Stopped' }],
        })}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Run this anime again' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Open Downloads' })).toHaveLength(1);
  });

  // This used to assert that a record carrying no action renders no footer at
  // all, guarding against an empty toolbar. `Mark unread` made that premise
  // false: the two lifecycle verbs apply to every record, so the toolbar can
  // no longer be empty, and mark-unread exists on no other surface. What is
  // still worth guarding is that the record does not sprout an action of its
  // own -- so the count is pinned, not the absence.
  it('renders only the two lifecycle verbs when the record carries no action of its own', () => {
    render(<NotificationDetail detail={buildDetail({ actionCount: 0, actions: [] })} />);

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark unread' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
