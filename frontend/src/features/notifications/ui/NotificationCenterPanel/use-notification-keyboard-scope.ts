import { useMemo } from 'react';
import type { CommandDefinition } from '../../../../shared/keyboard/keyboard.types';
import { useKeyboardScope } from '../../../../shared/keyboard/use-keyboard-scope';

/** Options accepted by `useNotificationKeyboardScope`. */
export interface UseNotificationKeyboardScopeOptions {
  /** Whether the currently loaded rows have anything unread to mark, mirroring `useNotificationMarkAllRead`'s own gate. */
  readonly canMarkAllRead: boolean;
  /** Marks every unread record the panel currently holds as read. */
  readonly onMarkAllRead: () => void;
}

/**
 * Registers "mark all as read" under the Notification Center's own scope
 * (spec "'Mark All As Read' Is Route-Scoped To The Notification Center,
 * Never Global"), active only while the panel that owns the mutation is
 * mounted. `enabled` mirrors `canMarkAllRead` so pressing `Alt+R` with
 * nothing unread swallows the chord instead of silently doing something
 * else (D9) -- there is deliberately no global fallback for this command.
 */
export function useNotificationKeyboardScope({ canMarkAllRead, onMarkAllRead }: Readonly<UseNotificationKeyboardScopeOptions>): void {
  // 5. Derived State
  const commands = useMemo<readonly CommandDefinition[]>(
    () => [
      {
        id: 'notification-center.mark-all-read',
        scope: 'notification-center',
        chord: 'alt+r',
        label: 'Mark all as read',
        section: 'Notifications',
        enabled: () => canMarkAllRead,
        run: () => onMarkAllRead(),
      },
    ],
    [canMarkAllRead, onMarkAllRead],
  );

  // 7. Effects
  useKeyboardScope({ scope: 'notification-center', commands });
}
