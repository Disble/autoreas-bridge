import { useCallback, useState } from 'react';
import type { Key } from 'react';
import { narrowSeasonSectionId } from './season-workspace.helpers';
import type { SeasonSectionId } from './season-workspace.types';

/**
 * Owns the selected Season Workspace section and validates tab keys.
 * @returns The current section and its selection callback.
 */
export function useSeasonWorkspaceTab() {
  const [activeTab, setActiveTab] = useState<SeasonSectionId>('overview');

  // Stryker disable ArrayDeclaration: this deps array is mutation-equivalent whether it is `[]`
  // or a fixed literal such as `["Stryker was here"]`: React compares dependency arrays
  // element-by-element with `Object.is`, and the callback closes over nothing but the stable
  // `useState` setter, so its identity stays stable under either one and no test can observe it.
  const selectTab = useCallback((key: Key) => {
    const sectionId = narrowSeasonSectionId(key);
    if (sectionId !== undefined) {
      setActiveTab(sectionId);
    }
  }, []);
  // Stryker restore ArrayDeclaration

  return { activeTab, selectTab };
}
