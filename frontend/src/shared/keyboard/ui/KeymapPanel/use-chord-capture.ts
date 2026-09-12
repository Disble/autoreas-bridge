import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useState } from 'react';
import { normalizeChord } from '../../chord.helpers';
import type { Chord } from '../../keyboard.types';
import type { UseChordCaptureResult } from './keymap-panel.types';

/**
 * The armed/record/cancel/blur chord-capture state machine (design D7).
 * `arm()` starts listening; the control's own `onKeyDown` calls
 * `event.preventDefault()` FIRST and unconditionally -- the entire
 * suppression mechanism that stops the same keypress from also reaching the
 * global `window` dispatcher, which bails at its `defaultPrevented` guard
 * (`dispatch.helpers.ts`) before it ever resolves a command, including one
 * bound to the exact chord being captured (spec "Chord Capture Records By
 * Listening And Never Triggers A Shortcut").
 *
 * Recording a chord does NOT disarm by itself: only `Escape`, losing focus,
 * or `onCaptured` reporting the chord was actually persisted end an arming.
 * @param onCaptured Called with each recorded chord (never a bare modifier),
 * always resolving to whether to disarm. Slice 62i had none and stayed
 * multi-shot forever, safe only because nothing persisted a capture yet;
 * Slice 62j's real write makes that risky (a stray keypress could silently
 * rebind and persist), so omitting it, or resolving `false` (design D8's
 * "REFUSE ... stay armed"), is what now keeps the original multi-shot behaviour.
 */
export function useChordCapture(onCaptured?: (chord: Chord) => Promise<boolean>): UseChordCaptureResult {
  // 4. State
  const [isArmed, setIsArmed] = useState(false);
  const [candidateChord, setCandidateChord] = useState<Chord | null>(null);

  // 6. Callbacks -- `arm`'s and `onBlur`'s `[]` deps arrays are EQUIVALENT
  // MUTANTS to mutation testing swapping them for a fixed-content literal
  // array (e.g. `["Stryker was here"]`): both close over nothing but the two
  // stable `useState` setters, which React guarantees never change identity
  // across renders, so a compile-time-constant array element compares equal
  // to itself by `Object.is` exactly like `[]` does either way -- and
  // nothing here observes either callback's own identity, only what calling
  // it does (mirrors `use-keymap-panel.ts`'s identical `onRebind`/`onRevert`/
  // `onResetToDefaults` precedent). A `// Stryker disable` comment does not
  // suppress it here for the same reason as that precedent: this array is a
  // trailing call argument, not a leading statement.
  const arm = useCallback(() => {
    setIsArmed(true);
    setCandidateChord(null);
  }, []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (!isArmed) {
        return;
      }
      // First and unconditional (design D7): whatever this keydown turns
      // out to mean below, the browser must never see it as un-prevented,
      // or the same physical keypress would also resolve and run a command.
      event.preventDefault();

      if (event.nativeEvent.isComposing) {
        return;
      }
      if (event.key === 'Escape') {
        setIsArmed(false);
        setCandidateChord(null);
        return;
      }
      const chord = normalizeChord(event);
      if (chord === null) {
        // A modifier held alone -- stay armed, record nothing (design D7).
        return;
      }
      setCandidateChord(chord);
      // The second `?.` is an EQUIVALENT MUTANT: when `onCaptured` is
      // undefined, JS's optional-chaining short-circuit already skips the
      // WHOLE rest of the expression, including a non-optional `.then` --
      // TypeScript still requires the `?.` syntactically, since the static
      // type of `onCaptured?.(chord)` is `Promise<boolean> | undefined`.
      void onCaptured?.(chord)?.then((shouldDisarm) => {
        if (shouldDisarm) {
          setIsArmed(false);
        }
      });
    },
    [isArmed, onCaptured],
  );

  const onBlur = useCallback(() => {
    setIsArmed(false);
  }, []);

  return { isArmed, candidateChord, arm, onKeyDown, onBlur };
}
