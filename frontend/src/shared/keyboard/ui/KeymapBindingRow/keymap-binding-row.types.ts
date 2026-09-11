import type { Chord, CommandBinding } from '../../keyboard.types';
import type { ChordHazard } from '../../keymap.types';
import type { KeymapRebindOutcome } from '../KeymapPanel/keymap-panel.types';

/**
 * Props for one row of the keymap Settings panel: a binding's declared
 * metadata, the chord it currently answers to, and the pointer-only
 * affordances to change it (design D10). `use-keymap-panel` derives every
 * field; the row never re-derives anything itself (frontend architecture
 * constraint #1 -- dumb rendering only).
 */
export interface KeymapBindingRowProps {
  /** The binding's declared metadata -- label, section, scope, shipped chord (design D3). */
  readonly binding: CommandBinding;
  /** The chord this binding currently answers to, already resolved through any override (design D2). */
  readonly effectiveChord: Chord;
  /**
   * The effective chord's non-blocking delivery risk, or `null` when none
   * applies (design D9). `ChordHazard` has exactly one member,
   * `'browser-zoom'` -- the dropped `'unverified-delivery'` family is
   * surfaced once below the map by the panel, never per row, so this prop
   * can never carry it.
   */
  readonly hazard: ChordHazard | null;
  /** Whether the effective chord differs from the shipped one. Gates the `Revert` button. */
  readonly isOverridden: boolean;
  /** Rendered only for a scoped binding, e.g. "while the Notification Center is open"; `null` for a global command. */
  readonly scopeNote: string | null;
  /** Starts a rebind for this row. Inert in Slice 62f -- wired to chord capture's `arm()` in Slice 62i. */
  readonly onRebind: () => void;
  /** Attempts to persist a chord captured for this row (design D6/D8/D7, Slice 62j); the panel already binds this row's own command `id`. Its `status` decides whether `useChordCapture` keeps listening (`'refused'`) or disarms. */
  readonly onCaptureChord: (chord: Chord) => Promise<KeymapRebindOutcome>;
  /** Restores this row's shipped chord. Inert in Slice 62f -- wired to `revertBinding` in Slice 62k. */
  readonly onRevert: () => void;
}
