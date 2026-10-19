import { toast } from '@heroui/react';
import { useCallback } from 'react';
import { ACTIVITY_COPY_FAILURE_MESSAGE, ACTIVITY_COPY_SUCCESS_MESSAGE } from './activity-run-story.constants';

/**
 * Owns "Copy for AI": writes an MCP-ready reference to the clipboard and
 * tells the user whether it landed, since the button itself shows nothing.
 *
 * @returns The copy action.
 */
export function useActivityCopy() {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const copy = useCallback((text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success(ACTIVITY_COPY_SUCCESS_MESSAGE))
      .catch(() => toast.danger(ACTIVITY_COPY_FAILURE_MESSAGE));
  }, []);

  // 7. Effects

  return { copy };
}
