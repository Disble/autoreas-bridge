import { toast } from '@heroui/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityIncidentSummary } from '../../../activity-source/activity.types';
import type { ActivityIncidentDetail, ActivityRequestDetail } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { ActivityIncidents } from '../ActivityIncidents';

/** One incident summary. */
function summary(latestId: number, title = `Incident ${latestId}`): ActivityIncidentSummary {
  return { latestId, fingerprint: `fp-${latestId}`, reason: 'http_5xx', title, latestAtMs: 0, firstSeenAtMs: 0, occurrences: 1, isNew: latestId === 9, isError: true };
}

/** A request incident whose window holds one folded reconcile row. */
const DETAIL: ActivityIncidentDetail = {
  incident: { id: 9, fingerprint: 'fp-9', reason: 'http_5xx', title: 'Sync failed for 5 requests', occurredAtMs: 120_000, windowStartMs: 0, windowEndMs: 150_000, sourceKind: 'request', sourceId: 'req-9' },
  cause: { known: true, errorCode: 'list_changes_failed', message: 'database is locked' },
  requests: [
    { routeTemplate: '/api/sync/reconcile', httpStatus: 500, count: 5, firstAtMs: 60_000, lastAtMs: 120_000, latestRequestId: 'req-9', kind: 'http', outcome: 'completed', maxDurationMs: 41, containsTrigger: true },
  ],
  events: [],
  phoneReports: [],
  earlier: [],
  expiresAtMs: 999_999,
};

/** The request the reconcile row opens; its response body is one long compact line. */
const REQUEST: ActivityRequestDetail = {
  requestId: 'req-9',
  capturedAtMs: 120_000,
  kind: 'http',
  route: '/api/sync/reconcile',
  transport: 'http',
  outcome: 'completed',
  errorCode: 'list_changes_failed',
  httpStatus: 500,
  durationMs: 41,
  requestBody: undefined,
  requestBodyState: '',
  responseBody: `{"error":"list_changes_failed","pad":"${'x'.repeat(2_000)}"}`,
  responseBodyState: '',
  deviceName: 'Pixel',
};

/** The one source instance the tab reads, as the real singleton is. */
const source = {
  listIncidents: vi.fn<ActivitySource['listIncidents']>(),
  listRecoveredRuns: vi.fn<ActivitySource['listRecoveredRuns']>(),
  getIncident: vi.fn<ActivitySource['getIncident']>(),
  getRequest: vi.fn<ActivitySource['getRequest']>(),
  getRunStory: vi.fn<ActivitySource['getRunStory']>(),
};

vi.mock('../../../activity-source/activity-source.helpers', () => ({
  createActivitySource: () => source,
}));

describe('ActivityIncidents', () => {
  beforeEach(() => {
    Object.values(source).forEach((read) => read.mockReset());
    source.listIncidents.mockResolvedValue([summary(9, 'Sync failed for 5 requests'), summary(4)]);
    source.listRecoveredRuns.mockResolvedValue([]);
    source.getIncident.mockResolvedValue(DETAIL);
    source.getRequest.mockResolvedValue(REQUEST);
    source.getRunStory.mockResolvedValue({ correlationId: 'dl-1', steps: [], truncated: false });
  });

  it('shows only the list skeleton while the list is unresolved', () => {
    source.listIncidents.mockReturnValue(new Promise(() => undefined));
    render(<ActivityIncidents openRequest={undefined} />);

    expect(screen.getByRole('status', { name: 'Loading incidents' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Incidents and runs' })).toBeNull();
    expect(screen.queryByText('Incidents could not be read')).toBeNull();
    expect(screen.getByRole('heading', { name: 'No incident selected' })).toBeInTheDocument();
  });

  it('shows only the failure, and reads again on "Try again"', async () => {
    source.listIncidents.mockRejectedValueOnce(new Error('locked'));
    render(<ActivityIncidents openRequest={undefined} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(screen.queryByText('Incidents could not be read')).toBeNull();

    expect(await screen.findByRole('list', { name: 'Incidents and runs' })).toBeInTheDocument();
    expect(source.listIncidents).toHaveBeenCalledTimes(2);
  });

  it('renders one progressive batch of a long list', async () => {
    source.listIncidents.mockResolvedValue(Array.from({ length: 45 }, (_unused, index) => summary(index + 100)));
    render(<ActivityIncidents openRequest={undefined} />);

    const list = await screen.findByRole('list', { name: 'Incidents and runs' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
  });

  it('narrows the list to a filter, and offers "Show all" when the filter hides everything', async () => {
    render(<ActivityIncidents openRequest={undefined} />);
    await screen.findByRole('list', { name: 'Incidents and runs' });
    source.listIncidents.mockResolvedValueOnce([]);

    fireEvent.click(screen.getByRole('radio', { name: 'Phone and sync' }));

    expect(await screen.findByText('No incidents for this filter')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Incidents and runs' })).toBeNull();
    expect(source.listIncidents).toHaveBeenLastCalledWith('phone');
    expect(source.listRecoveredRuns).toHaveBeenLastCalledWith('phone');

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(await screen.findByRole('list', { name: 'Incidents and runs' })).toBeInTheDocument();
    expect(source.listIncidents).toHaveBeenLastCalledWith('all');
  });

  it('opens an incident with one read by id, and its picked request with one read by id', async () => {
    render(<ActivityIncidents openRequest={undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /Sync failed for 5 requests/ }));

    expect(await screen.findByRole('heading', { name: 'Sync failed for 5 requests', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('database is locked')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /5 requests \(5 failed\)/ })).toBeInTheDocument();
    expect(source.getIncident).toHaveBeenCalledExactlyOnceWith(9);
    expect(source.getRequest).not.toHaveBeenCalled();

    // React Aria builds the table's rows in a second render pass, so the row is awaited, not read at once.
    fireEvent.click(await within(screen.getByRole('grid', { name: 'Requests in this window' })).findByText('/api/sync/reconcile'));

    const preview = await screen.findByText(/"error":"list_changes_failed"/);
    expect(preview.textContent?.length).toBeLessThan(700);
    expect(source.getRequest).toHaveBeenCalledExactlyOnceWith('req-9');

    fireEvent.click(screen.getByRole('button', { name: 'Show full body' }));
    expect(screen.getByRole('button', { name: 'Show first lines' })).toBeInTheDocument();
    expect(source.getRequest).toHaveBeenCalledTimes(1);
  });

  it('opens the incident another tab asked for without a pick', async () => {
    render(<ActivityIncidents openRequest={{ incidentId: 9 }} />);

    expect(await screen.findByRole('heading', { name: 'Sync failed for 5 requests', level: 2 })).toBeInTheDocument();
    expect(source.getIncident).toHaveBeenCalledExactlyOnceWith(9);
    expect(screen.queryByRole('heading', { name: 'No incident selected' })).toBeNull();
  });

  it('opens the run story instead of the request window for an internal incident', async () => {
    source.getIncident.mockResolvedValue({
      ...DETAIL,
      incident: { ...DETAIL.incident, sourceKind: 'event', sourceId: '7' },
      events: [{ id: 7, atMs: 120_000, domain: 'download', level: 'error', eventType: 'download.failed', message: 'Hoster dead', correlationId: 'dl-1' }],
    });
    render(<ActivityIncidents openRequest={{ incidentId: 9 }} />);

    await screen.findByRole('heading', { name: 'Sync failed for 5 requests', level: 2 });

    expect(screen.queryByRole('grid', { name: 'Requests in this window' })).toBeNull();
    expect(source.getRunStory).toHaveBeenCalledExactlyOnceWith('dl-1');
  });

  it('lists the runs of an internal filter and opens one as a run story', async () => {
    source.listRecoveredRuns.mockResolvedValue([{ correlationId: 'dl-1', firstAtMs: 0, lastAtMs: 0, steps: 2, outcome: 'warn', firstEventType: 'download.started', firstMessage: 'Download started' }]);
    render(<ActivityIncidents openRequest={undefined} />);
    await screen.findByRole('list', { name: 'Incidents and runs' });

    fireEvent.click(screen.getByRole('radio', { name: 'Downloads' }));
    fireEvent.click(await screen.findByRole('button', { name: /Download started/ }));

    expect(screen.getByText('Recovered runs')).toBeInTheDocument();
    expect(source.listRecoveredRuns).toHaveBeenLastCalledWith('downloads');
    expect(source.getRunStory).toHaveBeenCalledExactlyOnceWith('dl-1');
  });

  it('says the last 7 days are clear when nothing went wrong under All', async () => {
    source.listIncidents.mockResolvedValue([]);
    render(<ActivityIncidents openRequest={undefined} />);

    expect(await screen.findByText('No incidents in the last 7 days')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  });

  it('shows only the incident failure, and reads it again on "Try again"', async () => {
    source.getIncident.mockRejectedValueOnce(new Error('locked'));
    render(<ActivityIncidents openRequest={{ incidentId: 9 }} />);

    expect(await screen.findByText('This incident could not be read')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sync failed for 5 requests', level: 2 })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Sync failed for 5 requests', level: 2 })).toBeInTheDocument();
    expect(source.getIncident).toHaveBeenCalledTimes(2);
  });

  it('says an incident that aged out is no longer kept', async () => {
    source.getIncident.mockResolvedValue(undefined);
    render(<ActivityIncidents openRequest={{ incidentId: 9 }} />);

    expect(await screen.findByText('This incident is no longer kept')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Sync failed for 5 requests' })).toBeNull();
  });

  it('words an incident without a recorded cause, a window without requests, and a phone report on its lane', async () => {
    source.getIncident.mockResolvedValue({
      ...DETAIL,
      cause: { known: false, errorCode: '', message: '' },
      requests: [],
      phoneReports: [{ id: 3, atMs: 90_000, phoneAtMs: undefined, deviceId: 'd-1', kind: 'sync', outcome: '' }],
    });
    const { container } = render(<ActivityIncidents openRequest={{ incidentId: 9 }} />);

    expect(await screen.findByText('No cause was recorded for this incident.')).toBeInTheDocument();
    expect(screen.queryByText('Cause')).toBeNull();
    expect(screen.getByText('No request was captured in this window.')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-lane="Phone"] [data-lane-marker]')).toHaveLength(1);
  });

  it('shows a cause without a code as its message alone', async () => {
    source.getIncident.mockResolvedValue({ ...DETAIL, cause: { known: true, errorCode: '', message: 'database is locked' } });
    render(<ActivityIncidents openRequest={{ incidentId: 9 }} />);

    expect(await screen.findByText('database is locked')).toBeInTheDocument();
    expect(screen.queryByText(/list_changes_failed ·/)).toBeNull();
  });

  it('marks only the folded trigger row, and counts only folded rows', async () => {
    source.getIncident.mockResolvedValue({
      ...DETAIL,
      requests: [
        ...DETAIL.requests,
        { routeTemplate: '/api/health', httpStatus: 200, count: 1, firstAtMs: 30_000, lastAtMs: 30_000, latestRequestId: 'req-1', kind: 'http', outcome: 'completed', maxDurationMs: 3, containsTrigger: false },
      ],
    });
    render(<ActivityIncidents openRequest={{ incidentId: 9 }} />);

    const grid = await screen.findByRole('grid', { name: 'Requests in this window' });
    expect(within(grid).getAllByText('Trigger')).toHaveLength(1);
    expect(within(grid).getAllByText(/^×/)).toHaveLength(1);
    expect(within(grid).getByText('/api/health')).toBeInTheDocument();
  });

  it('shows only the request failure, reads it again on "Try again", and says when a request is no longer kept', async () => {
    source.getRequest.mockRejectedValueOnce(new Error('locked')).mockResolvedValueOnce(undefined);
    render(<ActivityIncidents openRequest={{ incidentId: 9 }} />);
    fireEvent.click(within(await screen.findByRole('grid', { name: 'Requests in this window' })).getByText('/api/sync/reconcile'));

    expect(await screen.findByText('This request could not be read')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('This request is no longer kept.')).toBeInTheDocument();
    expect(screen.queryByText('This request could not be read')).toBeNull();
    expect(source.getRequest).toHaveBeenCalledTimes(2);
  });

  it('shows a short body whole without a toggle, and notes a body cut at the capture limit', async () => {
    source.getRequest.mockResolvedValue({ ...REQUEST, requestBody: '{"since":0}', responseBodyState: 'truncated' });
    render(<ActivityIncidents openRequest={{ incidentId: 9 }} />);
    fireEvent.click(within(await screen.findByRole('grid', { name: 'Requests in this window' })).getByText('/api/sync/reconcile'));

    expect(await screen.findByText('{"since":0}')).toBeInTheDocument();
    expect(screen.getByText('Cut at the capture limit.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Show full body' })).toHaveLength(1);
  });

  it('copies an MCP-ready get_incident reference for AI, and says so when the clipboard refuses', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const success = vi.spyOn(toast, 'success').mockReturnValue('t');
    const danger = vi.spyOn(toast, 'danger').mockReturnValue('t');
    render(<ActivityIncidents openRequest={{ incidentId: 9 }} />);

    const copy = await screen.findByRole('button', { name: 'Copy this incident for AI' });
    await act(async () => fireEvent.click(copy));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('get_incident with {"id":9}'));
    expect(success).toHaveBeenCalledTimes(1);
    expect(danger).not.toHaveBeenCalled();

    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => fireEvent.click(copy));
    expect(danger).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledTimes(1);
  });
});
