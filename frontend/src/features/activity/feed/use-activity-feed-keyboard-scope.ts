import { useMemo } from 'react';
import type { CommandDefinition } from '../../../shared/keyboard/keyboard.types';
import { SCOPED_COMMAND_BINDINGS } from '../../../shared/keyboard/keymap.constants';
import { useKeyboardScope } from '../../../shared/keyboard/use-keyboard-scope';
import type { UseActivityFeedKeyboardScopeOptions } from './activity-feed.types';

/**
 * Registers ↑ / ↓ / Esc of the Activity detail drawer under the
 * `activity-feed` scope. The frame holds no command while the drawer is
 * closed, so the arrow keys keep scrolling the page and Esc falls through: a
 * disabled command would swallow them instead (D9). The bindings' metadata
 * comes from `SCOPED_COMMAND_BINDINGS`, so Settings → Shortcuts lists them.
 */
export function useActivityFeedKeyboardScope({ isDrawerOpen, onPrevious, onNext, onClose }: Readonly<UseActivityFeedKeyboardScopeOptions>): void {
  // 5. Derived State
  const commands = useMemo<readonly CommandDefinition[]>(
    () =>
      isDrawerOpen
        ? [
            { ...SCOPED_COMMAND_BINDINGS['activity-feed.previous'], run: () => onPrevious() },
            { ...SCOPED_COMMAND_BINDINGS['activity-feed.next'], run: () => onNext() },
            { ...SCOPED_COMMAND_BINDINGS['activity-feed.close'], run: () => onClose() },
          ]
        : [],
    [isDrawerOpen, onClose, onNext, onPrevious],
  );

  // 7. Effects
  useKeyboardScope({ scope: 'activity-feed', commands });
}
