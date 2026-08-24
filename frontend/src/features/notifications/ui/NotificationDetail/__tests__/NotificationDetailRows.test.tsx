import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationAction, NotificationDetailRow as NotificationDetailRowDTO } from '../../../../../shared/contracts/notification-center.types';
import { NotificationDetailRows } from '../NotificationDetailRows';

vi.mock('../use-notification-detail-covers', () => ({
  useNotificationDetailCovers: vi.fn().mockReturnValue(new Map()),
}));

afterEach(cleanup);

/** Minimal row fixture builder, matching the row test's own. */
function buildRow(overrides: Partial<NotificationDetailRowDTO> = {}): NotificationDetailRowDTO {
  return { detail: 'd', name: 'n', refId: 'anime-1', refType: 'anime', status: 's', ...overrides };
}

/** Minimal action fixture builder, matching the row test's own. */
function buildAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return { id: 'action-1', intent: 'download.run_anime', label: 'Run this anime again', ...overrides };
}

describe('NotificationDetailRows', () => {
  it('renders every row it is given, in order', () => {
    const rows = [buildRow({ name: 'First', refId: 'anime-1' }), buildRow({ name: 'Second', refId: 'anime-2' })];

    render(<NotificationDetailRows actions={[]} notificationId={1} rows={rows} />);

    const rendered = screen.getAllByText(/^(First|Second)$/);
    expect(rendered.map((element) => element.textContent)).toStrictEqual(['First', 'Second']);
  });

  it('resolves each row its own actions from the shared actions list, via actionIds', () => {
    const action = buildAction({ id: 'run-1', label: 'Run this anime again' });
    const rows = [buildRow({ actionIds: ['run-1'] })];

    render(<NotificationDetailRows actions={[action]} notificationId={1} rows={rows} />);

    expect(screen.getByRole('button', { name: 'Run this anime again' })).toBeInTheDocument();
  });

  it('renders a collapsed row inline among ordinary rows, still as a single block', () => {
    const rows = [buildRow({ name: 'Ordinary' }), buildRow({ collapsedCount: 6, detail: '6 more downloaded without incident', refId: 'collapsed-1' })];

    render(<NotificationDetailRows actions={[]} notificationId={1} rows={rows} />);

    expect(screen.getByText('Ordinary')).toBeInTheDocument();
    expect(screen.getByText('6 more downloaded without incident')).toBeInTheDocument();
  });

  it('renders nothing when there are no rows at all', () => {
    render(<NotificationDetailRows actions={[]} notificationId={1} rows={[]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
