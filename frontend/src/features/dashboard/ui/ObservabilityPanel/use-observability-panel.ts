import { useEffect, useState } from 'react';
import { getRecentLogs, subscribeToEvent } from '../../dashboard.bindings';
import { OBSERVABILITY_EVENT_NAME } from './observability-panel.constants';
import { keepRecentEntries, toObservabilityPanelViewModel } from './observability-panel.helpers';
import type { ObservabilityLogEntry, ObservabilityPanelViewModel } from './observability-panel.types';

/** Subscribes to runtime log events and exposes a capped, ordered entry buffer. */
export function useObservabilityPanel() {
  // 1. Refs

  // 2. State
  const [entries, setEntries] = useState<ObservabilityLogEntry[]>([]);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    let active = true;

    const stop = subscribeToEvent(OBSERVABILITY_EVENT_NAME, (entry: ObservabilityLogEntry) => {
      setEntries((currentEntries) => keepRecentEntries([...currentEntries, entry]));
    });

    void getRecentLogs().then((recentEntries) => {
      if (!active) {
        return;
      }

      setEntries(keepRecentEntries(recentEntries));
    });

    return () => {
      active = false;
      stop?.();
    };
  }, []);

  return {
    entries: entries.map(toObservabilityPanelViewModel) satisfies ObservabilityPanelViewModel[],
  };
}
