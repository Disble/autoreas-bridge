import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { popKeyboardScopeFrame, pushKeyboardScopeFrame } from './keyboard-scope.helpers';
import type { CommandDefinition, KeyboardScope } from './keyboard.types';

/**
 * Monotonic counter handing every mounted scope owner its own frame id.
 * Module-scoped rather than a shared store field: a frame id only ever needs
 * to be distinct among the frames simultaneously on the stack, and this
 * counter never resets for the life of the page.
 */
let nextKeyboardScopeFrameId = 0;

/** Hands out the next process-lifetime-unique keyboard scope frame id. */
function createKeyboardScopeFrameId(): number {
  nextKeyboardScopeFrameId += 1;
  return nextKeyboardScopeFrameId;
}

/** Options accepted by `useKeyboardScope`. */
export interface UseKeyboardScopeOptions {
  readonly scope: KeyboardScope;
  readonly commands: readonly CommandDefinition[];
}

/**
 * Pushes one scope frame for the calling surface's mounted lifetime (design
 * §3 "Scope stack lifecycle"). The frame is pushed exactly once and reads its
 * commands lazily through a ref refreshed every render, so it can never run a
 * stale closure (D10) even though `commands` itself is never in the push
 * effect's own dependency array. Pops by the frame's own id on cleanup --
 * never pop-last -- because `<React.StrictMode>` double-invokes effects and
 * popping the tail could remove a frame that belongs to someone else.
 */
export function useKeyboardScope({ scope, commands }: Readonly<UseKeyboardScopeOptions>): void {
  // 1. Refs
  const commandsRef = useRef(commands);

  // 2. State
  const [frameId] = useState(createKeyboardScopeFrameId);

  // 7. Effects
  useLayoutEffect(() => {
    commandsRef.current = commands;
  });

  useEffect(() => {
    pushKeyboardScopeFrame({ id: frameId, scope, getCommands: () => commandsRef.current });
    return () => popKeyboardScopeFrame(frameId);
  }, [frameId, scope]);
}
