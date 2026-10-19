import { toast, type Key } from '@heroui/react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { createActivitySource } from '../../activity-source/activity-source.helpers';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import type { ActivityIncidentOpenRequest } from '../ActivityIncidents/activity-incidents.types';
import { ACTIVITY_PAIRING_ROUTE } from '../ActivityNow/activity-now.constants';
import { ACTIVITY_PIN_FAILURE_MESSAGE, ACTIVITY_PIN_SUCCESS_MESSAGE } from './activity-screen.constants';
import { toActivityTabId } from './activity-screen.helpers';
import type { ActivityTabId } from './activity-screen.types';

/**
 * Owns the Activity shell: which tab is open, whether the 2-hour recorder
 * covers the tabs, "Pair a phone" and "Pin this moment". A pin is
 * a write the user asked for, so both its success and its failure are told.
 *
 * @param source The Activity port; the shared Wails source when omitted.
 * @returns The open tab, its selector, the incident Now asked to open with its opener, the recorder flag with its opener and closer, the pairing action, and the pin action with its busy flag.
 */
export function useActivityScreen(source: ActivitySource = createActivitySource()) {
  // 1. Refs

  // 2. State
  const [selectedTab, setSelectedTab] = useState<ActivityTabId>('now');
  const [isPinning, setIsPinning] = useState(false);
  const [incidentRequest, setIncidentRequest] = useState<ActivityIncidentOpenRequest | undefined>();
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);

  // 3. Context/3rd Party Hooks
  const navigate = useNavigate();

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const selectTab = useCallback((key: Key) => {
    setSelectedTab(toActivityTabId(key));
  }, []);

  // Each open is a new request object, so opening the same incident twice
  // still opens it after the user picked something else in between.
  const openIncident = useCallback((incidentId: number) => {
    setIncidentRequest({ incidentId });
    setSelectedTab('incidents');
  }, []);

  // The recorder covers the tabs without changing the selected one, so Back
  // returns to the tab the user left.
  const openRecorder = useCallback(() => setIsRecorderOpen(true), []);
  const closeRecorder = useCallback(() => setIsRecorderOpen(false), []);

  const pairPhone = useCallback(() => {
    void navigate(ACTIVITY_PAIRING_ROUTE);
  }, [navigate]);

  const pin = useCallback(() => {
    setIsPinning(true);
    void source
      .pinMoment()
      .then(() => toast.success(ACTIVITY_PIN_SUCCESS_MESSAGE))
      .catch(() => toast.danger(ACTIVITY_PIN_FAILURE_MESSAGE))
      .finally(() => setIsPinning(false));
  }, [source]);

  // 7. Effects

  return { selectedTab, selectTab, incidentRequest, openIncident, isRecorderOpen, openRecorder, closeRecorder, pairPhone, pin, isPinning };
}
