import type { Key } from '@heroui/react';
import { useCallback, useMemo, useState } from 'react';
import { createActivitySource } from '../../activity-source/activity-source.helpers';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import { toActivityReadValue } from '../ActivityRunStory/activity-time.helpers';
import { useActivityCopy } from '../ActivityRunStory/use-activity-copy';
import { useActivityRead } from '../ActivityRunStory/use-activity-read';
import { readActivityIncident, toActivityIncidentDetailModel } from './activity-incident-detail.helpers';
import { toActivityPickedKey } from './activity-incidents.helpers';
import type { ActivityPickedRequest } from './activity-incidents.types';
import { readActivityRequest, toActivityBodyKey, toActivityPickedRequestId, toActivityRequestDetailModel, toggleActivityOpenBody } from './activity-request-detail.helpers';

/**
 * Owns one incident's detail pane: exactly one `GetActivityIncident` read
 * per id (and per "Try again"), the picked request read once by its id, the
 * "Show full body" toggles of that request, and "Copy for AI". Nothing here
 * re-reads on a timer or a live event, so arrowing through rows never queues
 * full reads. A picked request and its open bodies belong to one incident and
 * one request, and are forgotten when either changes.
 *
 * @param incidentId The occurrence to read.
 * @param source The Activity port; the shared Wails source when omitted.
 * @returns The incident read and model, the picked request with its model, and the actions.
 */
export function useActivityIncidentDetail(incidentId: number, source: ActivitySource = createActivitySource()) {
  // 1. Refs

  // 2. State
  const [picked, setPicked] = useState<ActivityPickedRequest | undefined>();
  const [openBodies, setOpenBodies] = useState<readonly string[]>([]);

  // 3. Context/3rd Party Hooks
  const { copy } = useActivityCopy();

  // 4. Queries/Mutations
  const selectedRequestId = toActivityPickedRequestId(picked, incidentId);
  const { read, retry } = useActivityRead(source, incidentId, readActivityIncident);
  const { read: request, retry: retryRequest } = useActivityRead(source, selectedRequestId === '' ? undefined : selectedRequestId, readActivityRequest);

  // 5. Derived State (useMemo)
  const detail = toActivityReadValue(read);
  const model = useMemo(() => (detail === undefined ? undefined : toActivityIncidentDetailModel(detail)), [detail]);
  const requestDetail = toActivityReadValue(request);
  const requestModel = useMemo(() => (requestDetail === undefined ? undefined : toActivityRequestDetailModel(requestDetail)), [requestDetail]);

  // 6. Callbacks (useCallback calling pure helpers)
  const selectRequest = useCallback(
    (requestId: string) => {
      if (requestId === selectedRequestId) {
        return;
      }
      setPicked({ incidentId, requestId });
      setOpenBodies([]);
    },
    [incidentId, selectedRequestId],
  );

  const pickRequest = useCallback(
    (keys: 'all' | Iterable<Key>) => {
      const picked = toActivityPickedKey(keys);
      if (picked !== undefined) {
        selectRequest(picked);
      }
    },
    [selectRequest],
  );

  const toggleBody = useCallback(
    (label: string) => {
      const bodyKey = toActivityBodyKey(selectedRequestId, label);
      setOpenBodies((open) => toggleActivityOpenBody(open, bodyKey));
    },
    [selectedRequestId],
  );

  const isBodyOpen = useCallback((label: string) => openBodies.includes(toActivityBodyKey(selectedRequestId, label)), [openBodies, selectedRequestId]);

  const copyReference = useCallback(() => {
    if (model !== undefined) {
      copy(model.copyText);
    }
  }, [copy, model]);

  // 7. Effects

  return { read, model, selectedRequestId, request, requestModel, selectRequest, pickRequest, toggleBody, isBodyOpen, retry, retryRequest, copyReference };
}
