import { describe, expect, it, vi } from 'vitest';
import type { ActivityRequestDetail } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { readActivityRequest } from '../activity-request-detail.helpers';

/** A captured request with both bodies. */
function request(overrides: Partial<ActivityRequestDetail> = {}): ActivityRequestDetail {
  return {
    requestId: 'req-9',
    capturedAtMs: new Date(2026, 9, 17, 17, 31, 4, 120).getTime(),
    kind: 'http',
    route: '/api/sync/reconcile',
    transport: 'http',
    outcome: 'completed',
    errorCode: 'list_changes_failed',
    httpStatus: 500,
    durationMs: 41,
    requestBody: '{"cursor":0}',
    requestBodyState: '',
    responseBody: '{"error":"list_changes_failed"}',
    responseBodyState: '',
    deviceName: 'Pixel 8',
    ...overrides,
  };
}

describe('readActivityRequest', () => {
  it('reads one request by its id, gone once it is no longer stored', async () => {
    const found = request();
    const getRequest = vi.fn((id: string) => Promise.resolve(id === 'req-9' ? found : undefined));
    const source = { getRequest } as unknown as ActivitySource;
    await expect(readActivityRequest(source, 'req-9')).resolves.toEqual({ status: 'ready', value: found });
    await expect(readActivityRequest(source, 'req-1')).resolves.toEqual({ status: 'gone' });
  });
});
