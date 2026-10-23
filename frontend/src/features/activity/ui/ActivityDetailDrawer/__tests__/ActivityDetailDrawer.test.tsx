import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { feedLine, incident } from '../../../drawer/__tests__/drawer.fixtures';
import { ActivityDetailDrawer } from '../ActivityDetailDrawer';

/** The incident read the mocked source answers with. */
const getIncident = vi.fn<ActivitySource['getIncident']>();

/** The request read the mocked source answers with. */
const getRequest = vi.fn<ActivitySource['getRequest']>();

/** The one source instance the drawer reads, as the real singleton is. */
const source = { getIncident, getRequest, getRunStory: vi.fn() } as unknown as ActivitySource;

vi.mock('../../../activity-source/activity-source.helpers', () => ({
  createActivitySource: () => source,
}));

/** A failed traffic hour whose incident must be read. */
const FAILED_HOUR = feedLine(
  { type: 'traffic', origin: 'phone', failed: true, incidentId: 7, traffic: { hourStartMs: Date.UTC(2026, 9, 22, 9), requests: 39, failed: 1, maxDurationMs: 412 } },
  { kind: 'traffic_hour' },
);

/** A phone change that needs no read. */
const CHANGE = feedLine(
  { type: 'change', origin: 'phone' },
  { kind: 'change', source: 'mobile', title: 'Hotaru no Yomeiri', detail: 'episode_adjusted', beforeJson: '{"NroCapVisto":0}', afterJson: '{"NroCapVisto":1}' },
);

describe('ActivityDetailDrawer', () => {
  beforeEach(() => {
    getIncident.mockReset();
    getRequest.mockReset();
  });

  it('renders nothing while closed', () => {
    const { container } = render(<ActivityDetailDrawer line={undefined} onClose={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the header and the change presenter, and asks to close from ×', () => {
    const onClose = vi.fn();
    render(<ActivityDetailDrawer line={CHANGE} onClose={onClose} />);

    expect(screen.getByRole('heading', { name: 'Hotaru no Yomeiri' })).toBeInTheDocument();
    expect(screen.getByText('episode 0 → 1 · from the phone')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Episode' })).toHaveTextContent(/Before0.*After1/);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows only the loading region while the incident is unresolved', () => {
    getIncident.mockReturnValue(new Promise(() => undefined));
    render(<ActivityDetailDrawer line={FAILED_HOUR} onClose={vi.fn()} />);

    expect(screen.getByRole('status', { name: 'Loading the event detail' })).toBeInTheDocument();
    expect(screen.queryByTestId('activity-drawer-summary')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the failure alert instead of the summary when the read fails', async () => {
    getIncident.mockRejectedValue(new Error('db'));
    render(<ActivityDetailDrawer line={FAILED_HOUR} onClose={vi.fn()} />);

    expect(await screen.findByText('The event detail could not be read')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-drawer-summary')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the recorded cause, then opens the technical view and goes back', async () => {
    getIncident.mockResolvedValue(incident({ cause: { known: true, errorCode: '', message: 'invalid bearer token' } }));
    render(<ActivityDetailDrawer line={FAILED_HOUR} onClose={vi.fn()} />);

    expect(await screen.findByText('invalid bearer token')).toBeInTheDocument();
    expect(screen.getByText('Recorded message')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));
    expect(screen.getByTestId('activity-technical-view')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-drawer-summary')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to summary' }));
    await waitFor(() => expect(screen.getByTestId('activity-drawer-summary')).toBeInTheDocument());
  });

  it('resets to the summary when closed and opened again', () => {
    const { rerender } = render(<ActivityDetailDrawer line={CHANGE} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));

    rerender(<ActivityDetailDrawer line={undefined} onClose={vi.fn()} />);
    rerender(<ActivityDetailDrawer line={CHANGE} onClose={vi.fn()} />);

    expect(screen.getByTestId('activity-drawer-summary')).toBeInTheDocument();
  });
});
