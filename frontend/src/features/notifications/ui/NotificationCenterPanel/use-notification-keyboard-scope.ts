import { useMemo } from 'react';
import type { CommandDefinition } from '../../../../shared/keyboard/keyboard.types';
import { SCOPED_COMMAND_BINDINGS } from '../../../../shared/keyboard/keymap.constants';
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
 * The binding's identity/metadata come from `SCOPED_COMMAND_BINDINGS`
 * (design D3), not an inline literal, so the Settings panel can enumerate
 * this command even while the panel is unmounted -- only `enabled`/`run`
 * stay here, since they close over feature state the shared constant has
 * no access to.
 */
export function useNotificationKeyboardScope({ canMarkAllRead, onMarkAllRead }: Readonly<UseNotificationKeyboardScopeOptions>): void {
  // 5. Derived State
  const commands = useMemo<readonly CommandDefinition[]>(
    () => [
      {
        ...SCOPED_COMMAND_BINDINGS['notification-center.mark-all-read'],
        enabled: () => canMarkAllRead,
        run: () => onMarkAllRead(),
      },
    ],
    [canMarkAllRead, onMarkAllRead],
  );

  // 7. Effects
  useKeyboardScope({ scope: 'notification-center', commands });
}
