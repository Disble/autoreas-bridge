import { Button, Chip, Typography } from '@heroui/react';
import { formatChord } from '../../chord.helpers';
import { KEYMAP_CAPTURE_PROMPT, KEYMAP_ROW_CLASS } from '../KeymapPanel/keymap-panel.constants';
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
 * receiving it from a parent. Pressing `Rebind` still calls the `onRebind`
 * prop (Slice 62f's pinned contract) AND arms local capture; nothing is
 * persisted here -- a recorded chord lives in local state and is discarded
 * the next time `arm()` resets it (Slice 62i; saving one is Slice 62j).
 * `onRevert` is inert in this slice; `KeymapPanel` wires it in Slice 62k.
 * Shares `KEYMAP_ROW_CLASS` with the loading skeleton (Slice 62h) so the two
 * heights cannot drift.
 */
export function KeymapBindingRow({
  binding,
  effectiveChord,
  hazard,
  isOverridden,
  scopeNote,
  onRebind,
  onRevert,
}: Readonly<KeymapBindingRowProps>) {
  // 3. Context / 3rd party hooks
  const { isArmed, candidateChord, arm, onKeyDown, onBlur } = useChordCapture();

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
              onRebind();
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
    </div>
  );
}
