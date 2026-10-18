import { toast, type Key } from '@heroui/react';
import { useCallback, useState } from 'react';
import { createActivitySource } from '../../activity-source/activity-source.helpers';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import { ACTIVITY_PIN_FAILURE_MESSAGE, ACTIVITY_PIN_SUCCESS_MESSAGE } from './activity-screen.constants';
import { toActivityTabId } from './activity-screen.helpers';
import type { ActivityTabId } from './activity-screen.types';

/**
 * Owns the Activity shell: which tab is open and "Pin this moment". A pin is
 * a write the user asked for, so both its success and its failure are told.
 *
 * @param source The Activity port; the shared Wails source when omitted.
 * @returns The open tab, its selector, the incident opener, and the pin action with its busy flag.
 */
export function useActivityScreen(source: ActivitySource = createActivitySource()) {
  // 1. Refs

  // 2. State
  const [selectedTab, setSelectedTab] = useState<ActivityTabId>('now');
  const [isPinning, setIsPinning] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const selectTab = useCallback((key: Key) => {
    setSelectedTab(toActivityTabId(key));
  }, []);

  // The incident id reaches the Incidents tab once that tab reads incidents;
  // until then opening one only switches to it.
  const openIncident = useCallback((_incidentId: number) => {
    setSelectedTab('incidents');
  }, []);

  const pin = useCallback(() => {
    setIsPinning(true);
    void source
      .pinMoment()
      .then(() => toast.success(ACTIVITY_PIN_SUCCESS_MESSAGE))
      .catch(() => toast.danger(ACTIVITY_PIN_FAILURE_MESSAGE))
      .finally(() => setIsPinning(false));
  }, [source]);

  // 7. Effects

  return { selectedTab, selectTab, openIncident, pin, isPinning };
}
