import { Button, Chip, Typography } from '@heroui/react';
import { formatChord } from '../../chord.helpers';
import { KEYMAP_ROW_CLASS } from '../KeymapPanel/keymap-panel.constants';
import type { KeymapBindingRowProps } from './keymap-binding-row.types';

/**
 * One row of the keymap Settings panel: a binding's label, its currently
 * effective chord, an advisory hazard `Chip` when the chord is a
 * browser-zoom chord, a scope note for a scoped binding, and the `Rebind`/
 * `Revert` affordances (design D9/D10). Dumb component -- HeroUI primitives
 * only, no Wails calls, no business logic (frontend architecture constraint
 * #1). `onRebind`/`onRevert` are inert callbacks in this slice; `KeymapPanel`
 * wires them to real behaviour in Slices 62i/62k. Shares `KEYMAP_ROW_CLASS`
 * with its loading skeleton (Slice 62h) so the two heights cannot drift.
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
          <Typography color="muted" type="code">
            {formatChord(effectiveChord)}
          </Typography>
          <Button onPress={onRebind} size="sm" variant="secondary">
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
