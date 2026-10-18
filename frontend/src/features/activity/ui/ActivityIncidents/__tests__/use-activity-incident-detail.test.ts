import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityIncidentDetail, ActivityRequestDetail } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { useActivityIncidentDetail } from '../use-activity-incident-detail';

/** A request incident with one folded row. */
const DETAIL: ActivityIncidentDetail = {
  incident: { id: 42, fingerprint: 'fp', reason: 'http_5xx', title: 'Sync failed', occurredAtMs: 100, windowStartMs: 0, windowEndMs: 200, sourceKind: 'request', sourceId: 'req-9' },
  cause: { known: true, errorCode: 'e', message: 'm' },
  requests: [
    { routeTemplate: '/api/sync', httpStatus: 500, count: 3, firstAtMs: 50, lastAtMs: 100, latestRequestId: 'req-9', kind: 'http', outcome: 'completed', maxDurationMs: 41, containsTrigger: true },
  ],
  events: [],
  phoneReports: [],
  earlier: [],
  expiresAtMs: 999,
};

/** The request the row opens. */
const REQUEST: ActivityRequestDetail = {
  requestId: 'req-9',
  capturedAtMs: 100,
  kind: 'http',
  route: '/api/sync',
  transport: 'http',
  outcome: 'completed',
  errorCode: '',
  httpStatus: 500,
  durationMs: 41,
  requestBody: undefined,
  requestBodyState: '',
  responseBody: '{"error":"x"}',
  responseBodyState: '',
  deviceName: 'Pixel',
};

/** A source over the two by-id reads. */
function sourceWith(getIncident: ActivitySource['getIncident'], getRequest: ActivitySource['getRequest'] = vi.fn(() => Promise.resolve(REQUEST))): ActivitySource {
  return { getIncident, getRequest } as unknown as ActivitySource;
}

describe('useActivityIncidentDetail', () => {
  it('reads the incident once by id and words it', async () => {
    const getIncident = vi.fn(() => Promise.resolve(DETAIL));
    const source = sourceWith(getIncident);
    const { result } = renderHook(() => useActivityIncidentDetail(42, source));

    expect(result.current.read.status).toBe('loading');
    act(() => result.current.copyReference());
    await waitFor(() => expect(result.current.read.status).toBe('ready'));

    expect(getIncident).toHaveBeenCalledExactlyOnceWith(42);
    expect(result.current.model?.title).toBe('Sync failed');
    expect(result.current.request).toBeUndefined();
    expect(result.current.selectedRequestId).toBe('');
  });

  it('reads a picked request once by id, and not again when it is picked again', async () => {
    const getRequest = vi.fn(() => Promise.resolve(REQUEST));
    const source = sourceWith(() => Promise.resolve(DETAIL), getRequest);
    const { result } = renderHook(() => useActivityIncidentDetail(42, source));
    await waitFor(() => expect(result.current.read.status).toBe('ready'));

    act(() => result.current.pickRequest(new Set(['req-9'])));
    expect(result.current.request?.status).toBe('loading');
    await waitFor(() => expect(result.current.request?.status).toBe('ready'));
    act(() => result.current.toggleBody('Response body'));
    act(() => result.current.pickRequest(new Set(['req-9'])));
    act(() => result.current.pickRequest(new Set()));

    expect(getRequest).toHaveBeenCalledExactlyOnceWith('req-9');
    expect(result.current.selectedRequestId).toBe('req-9');
    expect(result.current.isBodyOpen('Response body')).toBe(true);
    expect(result.current.requestModel?.bodies[0].raw).toBe('{"error":"x"}');
  });

  it('opens and closes a full body, and closes it when another request is picked', async () => {
    const source = sourceWith(() => Promise.resolve(DETAIL));
    const { result } = renderHook(() => useActivityIncidentDetail(42, source));
    await waitFor(() => expect(result.current.read.status).toBe('ready'));
    act(() => result.current.selectRequest('req-9'));

    act(() => result.current.toggleBody('Response body'));
    expect(result.current.isBodyOpen('Response body')).toBe(true);
    expect(result.current.isBodyOpen('Request body')).toBe(false);

    act(() => result.current.toggleBody('Request body'));
    act(() => result.current.toggleBody('Response body'));
    expect(result.current.isBodyOpen('Response body')).toBe(false);
    expect(result.current.isBodyOpen('Request body')).toBe(true);

    act(() => result.current.toggleBody('Response body'));
    act(() => result.current.selectRequest('req-other'));
    expect(result.current.isBodyOpen('Response body')).toBe(false);
  });

  it('reads a gone incident and a gone request as gone, not failed', async () => {
    const source = sourceWith(
      () => Promise.resolve(undefined),
      () => Promise.resolve(undefined),
    );
    const { result } = renderHook(() => useActivityIncidentDetail(42, source));
    await waitFor(() => expect(result.current.read.status).toBe('gone'));

    act(() => result.current.selectRequest('req-9'));
    await waitFor(() => expect(result.current.request?.status).toBe('gone'));
  });

  it('retries a failed incident and a failed request, as often as they fail', async () => {
    const getIncident = vi.fn().mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(DETAIL);
    const getRequest = vi.fn().mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(REQUEST);
    const source = sourceWith(getIncident, getRequest);
    const { result } = renderHook(() => useActivityIncidentDetail(42, source));
    await waitFor(() => expect(result.current.read.status).toBe('failed'));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.read.status).toBe('failed'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.read.status).toBe('ready'));
    act(() => result.current.selectRequest('req-9'));
    await waitFor(() => expect(result.current.request?.status).toBe('failed'));

    act(() => result.current.retryRequest());
    await waitFor(() => expect(result.current.request?.status).toBe('failed'));
    act(() => result.current.retryRequest());
    await waitFor(() => expect(result.current.request?.status).toBe('ready'));
    expect(getIncident).toHaveBeenCalledTimes(3);
    expect(getRequest).toHaveBeenCalledTimes(3);
  });

  it('drops a late answer for an incident or a request that is no longer shown', async () => {
    let answerOld: (value: ActivityIncidentDetail) => void = () => undefined;
    let answerOldRequest: (value: ActivityRequestDetail) => void = () => undefined;
    const getIncident = vi.fn((id: number) => (id === 42 ? new Promise<ActivityIncidentDetail>((resolve) => (answerOld = resolve)) : Promise.resolve({ ...DETAIL, incident: { ...DETAIL.incident, id, title: 'Newer' } })));
    const getRequest = vi.fn((id: string) => (id === 'req-a' ? new Promise<ActivityRequestDetail>((resolve) => (answerOldRequest = resolve)) : Promise.resolve({ ...REQUEST, requestId: id })));
    const source = sourceWith(getIncident, getRequest);
    const { result, rerender } = renderHook(({ id }) => useActivityIncidentDetail(id, source), { initialProps: { id: 42 } });

    rerender({ id: 43 });
    await waitFor(() => expect(result.current.model?.title).toBe('Newer'));
    await act(async () => answerOld(DETAIL));
    expect(result.current.read.status).toBe('ready');
    expect(result.current.model?.title).toBe('Newer');

    act(() => result.current.selectRequest('req-a'));
    act(() => result.current.selectRequest('req-b'));
    await waitFor(() => expect(result.current.request?.status).toBe('ready'));
    await act(async () => answerOldRequest({ ...REQUEST, requestId: 'req-a' }));
    expect(result.current.request?.status).toBe('ready');
    expect(getRequest).toHaveBeenLastCalledWith('req-b');
  });

  it('forgets the picked request when another incident opens', async () => {
    const getIncident = vi.fn(() => Promise.resolve(DETAIL));
    const source = sourceWith(getIncident);
    const { result, rerender } = renderHook(({ id }) => useActivityIncidentDetail(id, source), { initialProps: { id: 42 } });
    await waitFor(() => expect(result.current.read.status).toBe('ready'));
    act(() => result.current.selectRequest('req-9'));

    rerender({ id: 43 });

    expect(result.current.read.status).toBe('loading');
    expect(result.current.selectedRequestId).toBe('');
    expect(result.current.request).toBeUndefined();
    await waitFor(() => expect(getIncident).toHaveBeenLastCalledWith(43));
  });
});
