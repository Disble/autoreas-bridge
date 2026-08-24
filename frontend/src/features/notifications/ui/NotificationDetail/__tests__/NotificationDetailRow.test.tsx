import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { NotificationAction, NotificationDetailRow as NotificationDetailRowDTO } from '../../../../../shared/contracts/notification-center.types';
import { NotificationDetailRow } from '../NotificationDetailRow';

afterEach(cleanup);

/** Minimal row fixture builder, matching the helpers test's own. */
function buildRow(overrides: Partial<NotificationDetailRowDTO> = {}): NotificationDetailRowDTO {
  return { detail: 'Episode 3 failed on every hoster', name: 'Tensei shitara Slime Datta Ken 4th Season', refId: 'anime-1', refType: 'anime', status: 'Stopped', ...overrides };
}

/** Minimal action fixture builder, matching the helpers test's own. */
function buildAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return { id: 'action-1', intent: 'download.run_anime', label: 'Run this anime again', ...overrides };
}

describe('NotificationDetailRow', () => {
  it('renders all four parts of a row: cover, name, status, detail, and its action', () => {
    render(<NotificationDetailRow actions={[buildAction()]} coverEntry={{ dataUrl: 'data:image/png;base64,abc', status: 'cover' }} row={buildRow()} />);

    expect(screen.getByRole('img', { name: 'Tensei shitara Slime Datta Ken 4th Season' })).toHaveAttribute('src', 'data:image/png;base64,abc');
    expect(screen.getByText('Tensei shitara Slime Datta Ken 4th Season')).toBeInTheDocument();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(screen.getByText('Episode 3 failed on every hoster')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run this anime again' })).toBeInTheDocument();
  });

  it('renders a row with no actions without any action button, since not every row carries one', () => {
    render(<NotificationDetailRow actions={[]} row={buildRow({ detail: 'Episodes 14-16 -- ready to watch', status: 'Downloaded' })} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-detail-row-actions')).not.toBeInTheDocument();
  });

  it('renders the actions block only once the row actually carries at least one action', () => {
    render(<NotificationDetailRow actions={[buildAction()]} row={buildRow()} />);

    expect(screen.getByTestId('notification-detail-row-actions')).toBeInTheDocument();
  });

  it('renders a refused action inline with its message and a permanently disabled button', () => {
    render(<NotificationDetailRow actions={[buildAction({ refusedReason: 'target_missing' })]} row={buildRow()} />);

    const button = screen.getByRole('button', { name: 'Run this anime again' });
    expect(button).toBeDisabled();
    expect(screen.getByText('The thing this action pointed at is gone.')).toBeInTheDocument();
  });

  it('renders no inline refusal message for an action that has not been refused', () => {
    render(<NotificationDetailRow actions={[buildAction()]} row={buildRow()} />);

    expect(screen.queryByText('The thing this action pointed at is gone.')).not.toBeInTheDocument();
  });

  it('renders a collapsed row as exactly ONE summary line, never one row per collapsed item', () => {
    render(<NotificationDetailRow actions={[]} row={buildRow({ collapsedCount: 7, detail: '7 other anime finished without incident' })} />);

    expect(screen.getByText('7 other anime finished without incident')).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Stopped')).not.toBeInTheDocument();
  });

  it('falls back to the placeholder cover art when no cover entry resolved, and never renders a real <img>', () => {
    render(<NotificationDetailRow actions={[]} row={buildRow()} />);

    expect(screen.queryByRole('img', { name: buildRow().name })).not.toBeInTheDocument();
    expect(screen.getByLabelText('No cover art')).toBeInTheDocument();
  });

  it('falls back to the placeholder cover art when the cover entry resolved to a placeholder', () => {
    render(<NotificationDetailRow actions={[]} coverEntry={{ status: 'placeholder' }} row={buildRow()} />);

    expect(screen.queryByRole('img', { name: buildRow().name })).not.toBeInTheDocument();
    expect(screen.getByLabelText('No cover art')).toBeInTheDocument();
  });

  it('renders every one of a row carrying more than one action, never truncating to the first', () => {
    render(
      <NotificationDetailRow
        actions={[buildAction({ id: 'a', label: 'Copy hoster 1' }), buildAction({ id: 'b', label: 'Copy hoster 2' })]}
        row={buildRow()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy hoster 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy hoster 2' })).toBeInTheDocument();
  });
});
