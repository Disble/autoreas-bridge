import { Alert, Button, Typography } from '@heroui/react';
import { KeymapBindingRow } from '../KeymapBindingRow/KeymapBindingRow';
import { KeymapPanelSkeleton } from './KeymapPanelSkeleton';
import { KEYMAP_PANEL_ERROR_TITLE } from './keymap-panel.constants';
import { useKeymapPanel } from './use-keymap-panel';
import type { KeymapPanelProps } from './keymap-panel.types';

/**
 * Settings panel for keyboard shortcut customization (design D10). Renders
 * the complete binding map FIRST -- spec "The Shortcuts Panel Renders The
 * Complete Map First..." -- with a reset-to-defaults affordance and a
 * hazard legend below it, never above the map.
 *
 * The three states are EXCLUSIVE (`autoreas-theme` skill, design D11): an
 * unresolved load (`keymapLoadState === 'pending'`) renders an announced
 * skeleton and nothing else; a failed load or save (`errorMessage !== null`)
 * renders the error `Alert` and nothing else, never a skeleton and never an
 * empty state -- the binding list is a non-empty compile-time array (pinned
 * by `keymap-panel.helpers.test.ts`'s registry guard), so a resolved-empty
 * state is unreachable and ships no `AirisEmptyState`. Only once loaded with
 * no error does the map render. Each row's `Rebind` actually captures and
 * persists a chord as of Slice 62j (design D6/D7/D8: the panel's `onRebind`
 * is bound to the row's own command `id` as `onCaptureChord`, a failed write
 * surfaces here via `errorMessage`, a refusal or a cross-scope shadow
 * warning surfaces on the row itself). As of Slice 62k, `Revert` and the
 * reset-to-defaults button below the map are both wired to the same
 * persist-then-publish path (design D6) -- the only two controls reachable
 * with no keyboard chord that get a user out of a keymap they broke (spec
 * "Recovery Is Always Reachable By Pointer Alone").
 */
export function KeymapPanel(props: Readonly<KeymapPanelProps>) {
  const { errorMessage, keymapLoadState, onRebind, onResetToDefaults, onRevert, sections } = useKeymapPanel(props);

  if (keymapLoadState === 'pending') {
    return <KeymapPanelSkeleton />;
  }

  if (errorMessage !== null) {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>{KEYMAP_PANEL_ERROR_TITLE}</Alert.Title>
          <Alert.Description>{errorMessage}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

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
                  onCaptureChord={(chord) => onRebind(row.binding.id, chord)}
                  onRevert={() => {
                    void onRevert(row.binding.id);
                  }}
                  scopeNote={row.scopeNote}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3" data-testid="keymap-panel-recovery">
        <Button
          onPress={() => {
            void onResetToDefaults();
          }}
          variant="tertiary"
        >
          Reset to defaults
        </Button>
        <Typography color="muted" type="body-sm">
          Rows marked &quot;Browser zoom&quot; may be intercepted by your browser&apos;s zoom shortcut.
        </Typography>
      </div>
    </div>
  );
}
