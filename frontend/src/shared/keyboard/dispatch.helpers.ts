import { normalizeChord } from './chord.helpers';
import type { ChordSourceEvent } from './chord.helpers';
import { KEYBOARD_COMMANDS } from './command-registry.constants';
import { TYPING_TAG_NAMES } from './keyboard.constants';
import { getKeyboardState } from './keyboard-scope.helpers';
import type { Chord, CommandContext, CommandDefinition, KeyboardScopeFrame } from './keyboard.types';

/**
 * The subset of an event target `isTypingTarget` reads. All fields optional
 * so a real DOM `EventTarget`/`HTMLElement` satisfies it structurally with
 * no cast at the real call site, while tests build plain literal objects
 * with no jsdom -- `dispatch.helpers.test.ts` runs in the `node` Vitest
 * project (`vite.config.ts`'s `nodeTestInclude`), the same reason
 * `ChordSourceEvent` narrows `KeyboardEvent` in `chord.helpers.ts`.
 */
export type TypingTargetLike = {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
  readonly getAttribute?: (name: string) => string | null;
};

/**
 * The subset of `KeyboardEvent` the dispatcher reads, mirroring
 * `ChordSourceEvent`'s structural narrowing for the same reason: a real
 * `keydown` event and a plain test literal both satisfy it with no cast.
 */
export type KeyboardDispatchEvent = ChordSourceEvent & {
  readonly defaultPrevented: boolean;
  readonly isComposing: boolean;
  readonly target: TypingTargetLike | null;
  readonly preventDefault: () => void;
};

/**
 * Whether an event's target is a surface the user is typing into: an
 * `<input>`/`<textarea>`, a `contenteditable` element, or an ARIA
 * `role="textbox"` (design §3 guard G3, spec Requirement "Exactly One Global
 * Dispatcher Bails On Four Guard Conditions").
 */
export function isTypingTarget(target: TypingTargetLike | null): boolean {
  if (target === null) {
    return false;
  }
  if (TYPING_TAG_NAMES.has(target.tagName)) {
    return true;
  }
  if (target.isContentEditable === true) {
    return true;
  }
  return target.getAttribute?.('role') === 'textbox';
}

/**
 * Resolves a chord to the command that owns it, walking the scope stack
 * top-down -- innermost frame (the array's last entry) first -- and falling
 * back to the global registry. The first frame that DECLARES the chord wins
 * outright, even if its `enabled()` will later say no, so a scoped command
 * never silently falls through to a same-chord global one (D9).
 */
export function resolveCommand(
  chord: Chord,
  frames: readonly KeyboardScopeFrame[],
  commands: readonly CommandDefinition[],
): CommandDefinition | null {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const match = frames[index].getCommands().find((command) => command.chord === chord);
    if (match !== undefined) {
      return match;
    }
  }
  return commands.find((command) => command.chord === chord) ?? null;
}

/**
 * The one global `keydown` handler, implementing design §3's 9-step
 * algorithm. Bails on four guards in order -- `defaultPrevented`,
 * `isComposing`, a typing target, then an unrecognized or unbound chord --
 * before resolving and running a command. `event.repeat` is deliberately
 * never read: auto-repeat is not a fifth guard (D12).
 */
export function dispatchKeyboardEvent(event: KeyboardDispatchEvent, context: CommandContext): void {
  if (event.defaultPrevented) {
    return;
  }
  if (event.isComposing) {
    return;
  }
  if (isTypingTarget(event.target)) {
    return;
  }
  const chord = normalizeChord(event);
  // Stryker disable next-line ConditionalExpression,BlockStatement: this guard exists to narrow
  // `chord` from `Chord | null` to `Chord` for resolveCommand's parameter type. Removing it is
  // runtime-equivalent: no `CommandDefinition.chord` is ever `null`, so resolveCommand(null, ...)
  // already returns `null`, and the `command === null` guard below bails identically either way.
  if (chord === null) {
    return;
  }
  const { frames } = getKeyboardState();
  const command = resolveCommand(chord, frames, KEYBOARD_COMMANDS);
  if (command === null) {
    return;
  }
  if (command.enabled?.() === false) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  command.run(context);
}
