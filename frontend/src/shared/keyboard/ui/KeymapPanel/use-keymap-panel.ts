import { useCallback, useMemo, useState } from 'react';
import { toast } from '@heroui/react';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import type { Chord, CommandBinding } from '../../keyboard.types';
import { setKeymapOverrides } from '../../keyboard-scope.helpers';
import { pruneKeymap, resolveKeymap, serializeKeymap } from '../../keymap.helpers';
import type { KeymapOverrides, ShadowedBinding } from '../../keymap.types';
import { findShadowedBindings } from '../../registry.helpers';
import { useKeyboardStore } from '../../use-keyboard-store';
import { KEYMAP_PANEL_ERROR_MESSAGE, KEYMAP_SAVED_MESSAGE } from './keymap-panel.constants';
import { groupBindingsBySection, listAllBindings, resolveKeymapPanelRows } from './keymap-panel.helpers';
import type { KeymapPanelProps, KeymapPanelSection, KeymapRebindOutcome, UseKeymapPanelResult } from './keymap-panel.types';

/** Identifies a successful `setKeymap` response (design D6), mirroring `isAutoStartSaved`'s exact shape (`use-auto-start-panel.ts`). Module-private: `onRebind` below is the only caller, so it stays untested at the unit level and proven only through `onRebind`'s own tests. */
function isKeymapSaved(status: string): boolean {
  return status === 'ok';
}

/**
 * The other command `id`'s candidate chord now collides with, in the same
 * scope, or `undefined` when there is none (design D8) -- a direct scan
 * over the exact `{scope, chord}` key `findDuplicateBindings` groups by,
 * cheaper than running through that helper for the single candidate change
 * `onRebind` ever makes. `id` absent from `resolved` leaves `binding`
 * `undefined`; the FIRST `binding?.scope` then short-circuits the `&&`
 * before the SECOND `binding?.chord` is ever reached, making that second
 * `?.` an EQUIVALENT MUTANT. Module-private, same reasoning as `isKeymapSaved`.
 */
function findCollidingBinding(resolved: readonly CommandBinding[], id: string): CommandBinding | undefined {
  const binding = resolved.find((entry) => entry.id === id);
  return resolved.find((entry) => entry.id !== id && entry.scope === binding?.scope && entry.chord === binding?.chord);
}

/** Names the colliding command to the user (spec "A same-scope duplicate is refused"). Module-private, same reasoning as `isKeymapSaved` above. */
function buildDuplicateRefusalMessage(colliding: CommandBinding): string {
  return `"${colliding.label}" already uses this chord in this scope.`;
}

/**
 * The shadow claiming `id`'s candidate chord across scopes, or `undefined`
 * otherwise (design D8). `SCOPED_COMMAND_BINDINGS` has exactly one entry
 * today, so this can only ever find zero or one group in practice, making
 * its predicate a data-shape EQUIVALENT MUTANT against `() => true`: a
 * second scoped command would make it observably matter again.
 */
function findOwnShadow(resolved: readonly CommandBinding[], id: string): ShadowedBinding | undefined {
  return findShadowedBindings(resolved).find((entry) => entry.scopedIds.includes(id) || entry.globalIds.includes(id));
}

/** Warns that the scoped claimant(s) take precedence while active (spec "...saved with a warning"). Same one-scoped-command reasoning as `findOwnShadow` makes the `', '` join separator an equivalent mutant today. */
function buildShadowWarningMessage(shadow: ShadowedBinding, resolved: readonly CommandBinding[]): string {
  const labelById = new Map(resolved.map((entry) => [entry.id, entry.label] as const));
  const scopedLabels = shadow.scopedIds.map((scopedId) => labelById.get(scopedId) ?? scopedId).join(', ');
  return `"${scopedLabels}" takes precedence over this chord while its scope is active.`;
}

/**
 * Derives the keymap panel's render-ready state from the shared keyboard
 * store (design D10/D11) and owns the persist-then-publish write path
 * (design D6/D8, Slice 62j) plus its two recovery affordances (design D5/D6,
 * Slice 62k -- spec "Recovery Is Always Reachable By Pointer Alone"). Slice
 * 62g computed only the effective rows; Slice 62h added `errorMessage`, the
 * single field `KeymapPanel` gates its accessible loading/error triad on
 * (task 8.2.2) -- `keymapLoadState` already distinguishes a failed read from
 * "loaded with zero overrides" (design D11, shipped ahead of this slice in
 * 62d), so no new store field was needed for the load half, only this
 * derivation.
 * @param props Its `source`, narrowed to `setKeymap`, defaults to the real
 * `preferencesSource` singleton (mirrors `AutoStartPanelProps.source`).
 */
export function useKeymapPanel(props: Readonly<KeymapPanelProps> = {}): UseKeymapPanelResult {
  // 2. State
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // 3. Context / 3rd party hooks
  const overrides = useKeyboardStore((state) => state.overrides);
  const keymapLoadState = useKeyboardStore((state) => state.keymapLoadState);

  // 5. Derived state
  const source = useMemo(() => props.source ?? preferencesSource, [props.source]);
  const sections = useMemo<readonly KeymapPanelSection[]>(
    () =>
      groupBindingsBySection(listAllBindings()).map(({ section, bindings }) => ({
        section,
        rows: resolveKeymapPanelRows(bindings, overrides),
      })),
    [overrides],
  );
  const errorMessage = keymapLoadState === 'failed' ? KEYMAP_PANEL_ERROR_MESSAGE : saveErrorMessage;

  // 6. Callbacks
  /**
   * Builds the candidate keymap, blocks on a same-scope duplicate (design
   * D8: refuse, name the colliding command, never write), otherwise persists
   * it and publishes to the store ONLY on a successful write (design D6),
   * warning first if the saved chord shadows a different-scope command.
   * `resolveKeymap`/`findCollidingBinding`/`findOwnShadow` all read from the
   * SAME `resolved` array built once here, so the refusal check, the shadow
   * check and the persisted bytes can never disagree with each other.
   */
  const onRebind = useCallback(
    (id: string, chord: Chord): Promise<KeymapRebindOutcome> => {
      const bindings = listAllBindings();
      const candidate = pruneKeymap({ ...overrides, [id]: chord }, bindings);
      const resolved = resolveKeymap(bindings, candidate);

      const colliding = findCollidingBinding(resolved, id);
      if (colliding !== undefined) {
        return Promise.resolve({ status: 'refused', message: buildDuplicateRefusalMessage(colliding) });
      }
      const shadow = findOwnShadow(resolved, id);
      // Shared by a non-'ok' status and an outright rejection alike (design D6: overrides stay untouched either way).
      const fail = (message: string): KeymapRebindOutcome => {
        setSaveErrorMessage(message);
        toast.danger(KEYMAP_PANEL_ERROR_MESSAGE);
        return { status: 'failed', message };
      };

      setSaveErrorMessage(null);
      return source
        .setKeymap(serializeKeymap(candidate))
        .then((status): KeymapRebindOutcome => {
          if (!isKeymapSaved(status)) {
            return fail(status);
          }
          setKeymapOverrides(candidate);
          toast.success(KEYMAP_SAVED_MESSAGE);
          if (shadow === undefined) {
            return { status: 'saved', message: null };
          }
          const message = buildShadowWarningMessage(shadow, resolved);
          toast.warning(message);
          return { status: 'shadowed', message };
        })
        .catch((): KeymapRebindOutcome => fail(KEYMAP_PANEL_ERROR_MESSAGE));
    },
    [overrides, source],
  );
  /**
   * Persists `candidate` and publishes it to the store only once the write
   * succeeds (design D6) -- the exact success/failure handling `onRebind`
   * established in 62j, factored out here so `onRevert`/`onResetToDefaults`
   * share it instead of re-deriving it. Neither caller needs a refusal or
   * shadow check: removing an override can only ever narrow the candidate
   * back toward the shipped registry, which `onRebind`'s own checks already
   * guarantee is conflict-free before any override existed.
   */
  const persistOverrides = useCallback(
    (candidate: KeymapOverrides): Promise<void> => {
      setSaveErrorMessage(null);
      return source
        .setKeymap(serializeKeymap(candidate))
        .then((status) => {
          if (!isKeymapSaved(status)) {
            setSaveErrorMessage(status);
            toast.danger(KEYMAP_PANEL_ERROR_MESSAGE);
            return;
          }
          setKeymapOverrides(candidate);
          toast.success(KEYMAP_SAVED_MESSAGE);
        })
        .catch(() => {
          setSaveErrorMessage(KEYMAP_PANEL_ERROR_MESSAGE);
          toast.danger(KEYMAP_PANEL_ERROR_MESSAGE);
        });
    },
    [source],
  );
  /** Restores one command's shipped chord, leaving every other override unchanged (spec "Per-binding revert..."). */
  const onRevert = useCallback(
    (id: string): Promise<void> => {
      const { [id]: _dropped, ...candidate } = overrides;
      return persistOverrides(candidate);
    },
    [overrides, persistOverrides],
  );
  /** Restores every shipped chord via Go's own `SetKeymap("")` escape hatch (design D5) -- `serializeKeymap({})` already returns `''`, so persisting an empty override set never enumerates the defaults, which would go stale the moment one changes. */
  const onResetToDefaults = useCallback((): Promise<void> => persistOverrides({}), [persistOverrides]);

  return {
    keymapLoadState,
    saveErrorMessage,
    errorMessage,
    sections,
    onRebind,
    onRevert,
    onResetToDefaults,
  };
}
