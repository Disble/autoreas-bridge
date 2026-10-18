import { describe, expect, it, vi } from 'vitest';
import type { ActivityRequestDetail } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import {
  previewActivityBody,
  readActivityRequest,
  toActivityBodyKey,
  toActivityBodyModel,
  toActivityPickedRequestId,
  toActivityRequestDetailModel,
  toggleActivityOpenBody,
} from '../activity-request-detail.helpers';

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

describe('activity-request-detail.helpers', () => {
  it('keeps a short body whole', () => {
    expect(previewActivityBody('{"a":1}\n{"b":2}')).toEqual({ preview: '{"a":1}\n{"b":2}', isComplete: true });
  });

  it('cuts a body at its first 8 lines', () => {
    const lines = Array.from({ length: 12 }, (_unused, index) => `line ${index + 1}`);

    expect(previewActivityBody(lines.join('\n'))).toEqual({ preview: lines.slice(0, 8).join('\n'), isComplete: false });
    expect(previewActivityBody(lines.slice(0, 8).join('\n'))).toEqual({ preview: lines.slice(0, 8).join('\n'), isComplete: true });
  });

  it('cuts one long line at 600 characters, the shape of a compact 64 KB JSON body', () => {
    const body = 'x'.repeat(65_489);

    expect(previewActivityBody(body)).toEqual({ preview: 'x'.repeat(600), isComplete: false });
    expect(previewActivityBody('x'.repeat(600))).toEqual({ preview: 'x'.repeat(600), isComplete: true });
  });

  it('words a stored body, a truncated one, a binary one and a missing one', () => {
    expect(toActivityBodyModel('Response body', '{"a":1}', '')).toEqual({
      label: 'Response body',
      state: 'captured',
      notice: '',
      preview: '{"a":1}',
      isComplete: true,
      raw: '{"a":1}',
      note: '',
    });
    expect(toActivityBodyModel('Response body', 'abc', 'truncated')).toMatchObject({ state: 'captured', raw: 'abc', note: 'Cut at the capture limit.' });
    expect(toActivityBodyModel('Request body', undefined, 'omitted_binary')).toEqual({
      label: 'Request body',
      state: 'not-captured',
      notice: 'A binary body is not stored.',
      preview: '',
      isComplete: true,
      raw: '',
      note: '',
    });
    expect(toActivityBodyModel('Request body', undefined, '')).toMatchObject({ state: 'not-captured', notice: 'No body was stored.' });
    expect(toActivityBodyModel('Request body', '', '')).toMatchObject({ state: 'not-captured', notice: 'No body was stored.' });
  });

  it('words the selected request: its summary, then the response body before the request body', () => {
    const model = toActivityRequestDetailModel(request());

    expect(model.summary).toBe('17:31:04.120 · /api/sync/reconcile · 500 · 41 ms · Pixel 8 · list_changes_failed');
    expect(model.bodies.map((body) => [body.label, body.raw])).toEqual([
      ['Response body', '{"error":"list_changes_failed"}'],
      ['Request body', '{"cursor":0}'],
    ]);
  });

  it('leaves unrecorded parts out of the summary', () => {
    expect(toActivityRequestDetailModel(request({ httpStatus: undefined, durationMs: undefined, deviceName: '', errorCode: '' })).summary).toBe(
      '17:31:04.120 · /api/sync/reconcile · completed',
    );
  });
});

describe('activity request selection helpers', () => {
  it('keeps a picked request only for the incident it was picked in', () => {
    const picked = { incidentId: 7, requestId: 'req-9' };
    expect(toActivityPickedRequestId(picked, 7)).toBe('req-9');
    expect(toActivityPickedRequestId(picked, 8)).toBe('');
    expect(toActivityPickedRequestId(undefined, 7)).toBe('');
  });

  it('keys a body by its request and label', () => {
    expect(toActivityBodyKey('req-9', 'Request body')).toBe('req-9:Request body');
  });

  it('opens a closed body after the open ones, and closes an open one alone', () => {
    expect(toggleActivityOpenBody(['a:x'], 'a:y')).toEqual(['a:x', 'a:y']);
    expect(toggleActivityOpenBody(['a:x', 'a:y', 'a:z'], 'a:y')).toEqual(['a:x', 'a:z']);
  });
});

describe('readActivityRequest', () => {
  it('reads one request by its id, gone once it is no longer stored', async () => {
    const found = request();
    const getRequest = vi.fn((id: string) => Promise.resolve(id === 'req-9' ? found : undefined));
    const source = { getRequest } as unknown as ActivitySource;
    await expect(readActivityRequest(source, 'req-9')).resolves.toEqual({ status: 'ready', value: found });
    await expect(readActivityRequest(source, 'req-1')).resolves.toEqual({ status: 'gone' });
  });
});
