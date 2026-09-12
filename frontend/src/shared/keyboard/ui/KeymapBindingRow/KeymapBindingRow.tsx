import { useCallback, useState } from 'react';
import { Button, Chip, Typography } from '@heroui/react';
import { formatChord } from '../../chord.helpers';
import type { Chord } from '../../keyboard.types';
import { KEYMAP_CAPTURE_PROMPT, KEYMAP_ROW_CLASS } from '../KeymapPanel/keymap-panel.constants';
import type { KeymapRebindOutcome } from '../KeymapPanel/keymap-panel.types';
import { useChordCapture } from '../KeymapPanel/use-chord-capture';
import type { KeymapBindingRowProps } from './keymap-binding-row.types';

/**
 * One row of the keymap Settings panel: a binding's label, its currently
 * effective chord, an advisory hazard `Chip` when the chord is a
 * browser-zoom chord, a scope note for a scoped binding, and the `Rebind`/
 * `Revert` affordances (design D9/D10). Dumb component -- HeroUI primitives
 * only, no Wails calls (frontend architecture constraint #1) -- but the
 * `Rebind` control's OWN listening state is local UI state, not business
 * logic, so it owns `useChordCapture` directly (design D7's own placement,
 * `keymap-panel.types.ts`'s `UseChordCaptureResult` doc comment) rather than
 * receiving it from a parent. Pressing `Rebind` arms that local capture and
 * nothing else.
 *
 * 62f gave this row an `onRebind` prop that notified a parent when arming
 * happened. It is gone: once 62j made `onCaptureChord` the path a captured
 * chord actually travels, the only caller passed `onRebind` a no-op, and an
 * API whose sole consumer ignores it outlives everyone who remembers why it
 * was added.
 *
 * Slice 62j wires the actual write: every captured chord goes to
 * `onCaptureChord`, the panel's real persist-then-publish path (design
 * D6/D8) already bound to this row's own command id; `useChordCapture`
 * disarms unless the result is `'refused'` (design D8's "stay armed" case).
 * The returned message (a refusal or a shadow warning) renders below the
 * row until the next `Rebind` press clears it.
 * `onRevert` is bound to `revertBinding` via `KeymapPanel` as of Slice 62k;
 * the row still just presses the button through, since recovery has no
 * "stay armed" state to react to the way `onCaptureChord`'s outcome does.
 * Shares `KEYMAP_ROW_CLASS` with the loading skeleton (Slice 62h) so the two
 * heights cannot drift.
 */
export function KeymapBindingRow({
  binding,
  effectiveChord,
  hazard,
  isOverridden,
  scopeNote,
  onCaptureChord,
  onRevert,
}: Readonly<KeymapBindingRowProps>) {
  // 4. State
  const [outcome, setOutcome] = useState<KeymapRebindOutcome | null>(null);

  // 6. Callbacks
  const handleCaptured = useCallback(
    (chord: Chord): Promise<boolean> => {
      setOutcome(null);
      return onCaptureChord(chord).then((result) => {
        setOutcome(result);
        return result.status !== 'refused';
      });
    },
    [onCaptureChord],
  );

  // 3. Context / 3rd party hooks
  const { isArmed, candidateChord, arm, onKeyDown, onBlur } = useChordCapture(handleCaptured);

  // 5. Derived state
  const isAwaitingFirstKeypress = isArmed && candidateChord === null;

  return (
    <div className={KEYMAP_ROW_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Typography type="body">{binding.label}</Typography>
          {scopeNote !== null && (
            <Typography className="mt-1 block" color="muted" data-testid="keymap-binding-row-scope-note" type="body-sm">
              {scopeNote}
            </Typography>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hazard === 'browser-zoom' && (
            <Chip color="warning" size="sm" variant="soft">
              <Chip.Label>Browser zoom</Chip.Label>
            </Chip>
          )}
          <Typography color="muted" data-testid="keymap-binding-row-chord" type="code">
            {isAwaitingFirstKeypress ? KEYMAP_CAPTURE_PROMPT : formatChord(candidateChord ?? effectiveChord)}
          </Typography>
          <Button
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            onPress={() => {
              setOutcome(null);
              arm();
            }}
            size="sm"
            variant="secondary"
          >
            Rebind
          </Button>
          <Button isDisabled={!isOverridden} onPress={onRevert} size="sm" variant="tertiary">
            Revert
          </Button>
        </div>
      </div>
      {outcome !== null && outcome.message !== null && (
        <Typography
          className={outcome.status === 'refused' ? 'mt-2 block text-danger' : 'mt-2 block text-warning'}
          data-testid="keymap-binding-row-message"
          role="alert"
          type="body-sm"
        >
          {outcome.message}
        </Typography>
      )}
    </div>
  );
}
