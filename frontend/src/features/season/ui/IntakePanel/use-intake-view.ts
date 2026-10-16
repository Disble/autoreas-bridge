import { useCallback, useState } from 'react';
import { narrowIntakeView, resolveIntakeView } from './intake-view.helpers';
import type { IntakeMode, IntakeView } from './intake-panel.types';

/**
 * useIntakeView owns which rows List mode shows: the active intake or the
 * discarded rows. Once no row is discarded the picked view is reset to Active
 * during render (the React "adjust state on a prop change" pattern, no effect),
 * so the toggle disappearing never strands the list on an empty view and a later
 * discard does not jump back to it. Raw mode always shows the active rows but
 * keeps the pick, so returning to List returns to the view the user left.
 * @param discardedCount How many rows are discarded right now.
 * @param mode The current editing mode.
 * @returns The view to show and the toggle's change handler.
 */
export function useIntakeView(discardedCount: number, mode: IntakeMode) {
  // 2. State
  const [view, setView] = useState<IntakeView>('active');
  // 5. Derived State
  if (discardedCount === 0 && view !== 'active') {
    setView('active');
  }
  const shownView = resolveIntakeView(view, discardedCount, mode);
  // 6. Callbacks
  // Stryker disable ArrayDeclaration: this deps array is mutation-equivalent whether it is `[]` or a
  // fixed literal: the callback closes over only the stable React `setView` setter and the
  // module-level `narrowIntakeView` helper, so React never observes a dependency change.
  const onViewChange = useCallback((key: string | number) => {
    const next = narrowIntakeView(key);
    if (next !== undefined) {
      setView(next);
    }
  }, []);
  // Stryker restore ArrayDeclaration

  return { view: shownView, onViewChange };
}
