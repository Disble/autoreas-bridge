import { Button, Typography } from '@heroui/react';
import { KeymapBindingRow } from '../KeymapBindingRow/KeymapBindingRow';
import { useKeymapPanel } from './use-keymap-panel';
import type { KeymapPanelProps } from './keymap-panel.types';

/**
 * Settings panel for keyboard shortcut customization (design D10). Renders
 * the complete binding map FIRST -- spec "The Shortcuts Panel Renders The
 * Complete Map First..." -- with a reset-to-defaults affordance and a
 * hazard legend below it, never above the map.
 *
 * This slice (62g) ships the map read-only: the reset button below is a
 * static, disabled placeholder wired for real in Slice 62k, and every row's
 * `Rebind`/`Revert` stay inert until Slices 62i-62k wire chord capture,
 * persistence and recovery (design Note D). The mandatory accessible
 * loading/error states the spec also requires are Slice 62h's -- this
 * interim, always-rendered map is never a shipped end state on its own.
 */
export function KeymapPanel(props: Readonly<KeymapPanelProps>) {
  const { sections } = useKeymapPanel(props);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5" data-testid="keymap-panel-map">
        {sections.map((section) => (
          <div className="flex flex-col gap-2" key={section.section}>
            <Typography type="h6">{section.section}</Typography>
            <div className="flex flex-col gap-2">
              {section.rows.map((row) => (
                <KeymapBindingRow
                  binding={row.binding}
                  effectiveChord={row.effectiveChord}
                  hazard={row.hazard}
                  isOverridden={row.isOverridden}
                  key={row.binding.id}
                  onRebind={() => {}}
                  onRevert={() => {}}
                  scopeNote={row.scopeNote}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3" data-testid="keymap-panel-recovery">
        <Button isDisabled onPress={() => {}} variant="tertiary">
          Reset to defaults
        </Button>
        <Typography color="muted" type="body-sm">
          Rows marked &quot;Browser zoom&quot; may be intercepted by your browser&apos;s zoom shortcut.
        </Typography>
      </div>
    </div>
  );
}
