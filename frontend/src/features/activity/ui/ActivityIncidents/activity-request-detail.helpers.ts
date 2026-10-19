import type { ActivityRequestDetail } from '../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import { formatActivityClock, formatActivityDuration, toActivityFoundRead } from '../ActivityRunStory/activity-time.helpers';
import { ACTIVITY_BODY_OMITTED_BINARY, ACTIVITY_BODY_PREVIEW_CHARS, ACTIVITY_BODY_PREVIEW_LINES, ACTIVITY_BODY_TRUNCATED } from './activity-incidents.constants';
import type { ActivityBodyModel, ActivityPickedRequest, ActivityRequestDetailModel, ActivityRequestRead } from './activity-incidents.types';

/**
 * The first lines of a body, cut without parsing: at most 8 lines and at
 * most 600 characters, since a compact JSON body is one long line.
 *
 * @param raw The stored body.
 * @returns The preview and whether it already holds the whole body.
 */
export function previewActivityBody(raw: string): { readonly preview: string; readonly isComplete: boolean } {
  const preview = raw.split('\n', ACTIVITY_BODY_PREVIEW_LINES).join('\n').slice(0, ACTIVITY_BODY_PREVIEW_CHARS);
  return { preview, isComplete: preview.length === raw.length };
}

/**
 * Words one body: its preview and note when stored, the reason when not.
 *
 * @param label `Response body` or `Request body`.
 * @param raw The stored text; undefined when none was stored.
 * @param state The stored body state.
 * @returns The body the pane renders.
 */
export function toActivityBodyModel(label: string, raw: string | undefined, state: string): ActivityBodyModel {
  if (raw === undefined || raw === '') {
    const notice = state === ACTIVITY_BODY_OMITTED_BINARY ? 'A binary body is not stored.' : 'No body was stored.';
    return { label, state: 'not-captured', notice, preview: '', isComplete: true, raw: '', note: '' };
  }
  const { preview, isComplete } = previewActivityBody(raw);
  return { label, state: 'captured', notice: '', preview, isComplete, raw, note: state === ACTIVITY_BODY_TRUNCATED ? 'Cut at the capture limit.' : '' };
}

/**
 * Words the selected request: one summary line, then the response body
 * (what the bridge answered) before the request body.
 *
 * @param request The request read by id.
 * @returns The request pane's model.
 */
export function toActivityRequestDetailModel(request: ActivityRequestDetail): ActivityRequestDetailModel {
  const parts = [
    formatActivityClock(request.capturedAtMs),
    request.route,
    request.httpStatus === undefined ? request.outcome : String(request.httpStatus),
    request.durationMs === undefined ? '' : formatActivityDuration(request.durationMs),
    request.deviceName,
    request.errorCode,
  ];
  return {
    summary: parts.filter((part) => part !== '').join(' · '),
    bodies: [
      toActivityBodyModel('Response body', request.responseBody, request.responseBodyState),
      toActivityBodyModel('Request body', request.requestBody, request.requestBodyState),
    ],
  };
}

/**
 * The selected request: the one picked in this incident, else none.
 *
 * @param picked The last picked request, with the incident it was picked in.
 * @param incidentId The incident shown now.
 * @returns The request id, or empty when none is selected.
 */
export function toActivityPickedRequestId(picked: ActivityPickedRequest | undefined, incidentId: number): string {
  return picked?.incidentId === incidentId ? picked.requestId : '';
}

/**
 * Keys one body of one request, so open bodies never leak across requests.
 *
 * @param requestId The request.
 * @param label The body's label.
 * @returns `<requestId>:<label>`.
 */
export function toActivityBodyKey(requestId: string, label: string): string {
  return `${requestId}:${label}`;
}

/**
 * Opens a closed body after the open ones, or closes an open one.
 *
 * @param open The keys of the open bodies.
 * @param bodyKey The body toggled.
 * @returns The open keys after the toggle.
 */
export function toggleActivityOpenBody(open: readonly string[], bodyKey: string): readonly string[] {
  return open.includes(bodyKey) ? open.filter((item) => item !== bodyKey) : [...open, bodyKey];
}

/**
 * Reads one captured request; gone once it is no longer stored.
 *
 * @param source The Activity port.
 * @param requestId The request.
 * @returns The ready or gone read; rejects when the read fails.
 */
export function readActivityRequest(source: ActivitySource, requestId: string): Promise<ActivityRequestRead> {
  return source.getRequest(requestId).then(toActivityFoundRead);
}
