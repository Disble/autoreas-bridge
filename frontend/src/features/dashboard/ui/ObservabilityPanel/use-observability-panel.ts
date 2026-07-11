import { useEffect, useState } from 'react';
import { observabilityLogSource } from '../../../../infrastructure/observability-log-source/observability-log-source.helpers';
import type { ObservabilityLogSource } from '../../../../infrastructure/observability-log-source/observability-log-source.types';
import { keepRecentEntries, toObservabilityPanelViewModel } from './observability-panel.helpers';
import type { ObservabilityLogEntry, ObservabilityPanelViewModel } from './observability-panel.types';

/** Subscribes to runtime log events and exposes a capped, ordered entry buffer. */
export function useObservabilityPanel(source: ObservabilityLogSource = observabilityLogSource) {
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

    const unsubscribe = source.subscribe((entry: ObservabilityLogEntry) => {
      setEntries((currentEntries) => keepRecentEntries([...currentEntries, entry]));
    });

    void source.getRecentLogs().then((recentEntries) => {
      if (!active) {
        return;
      }

      setEntries(keepRecentEntries([...recentEntries]));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [source]);

  return {
    entries: entries.map(toObservabilityPanelViewModel) satisfies ObservabilityPanelViewModel[],
  };
}
