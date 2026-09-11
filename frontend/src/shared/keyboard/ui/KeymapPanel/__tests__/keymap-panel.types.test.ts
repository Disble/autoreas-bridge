import { describe, expect, it } from 'vitest';
import type { KeymapPanelProps, UseChordCaptureResult, UseKeymapPanelResult } from '../keymap-panel.types';

/**
 * These builders exist so `KeymapPanelProps`, `UseKeymapPanelResult` and
 * `UseChordCaptureResult` have a real consumer before the hooks that return
 * them exist (Slices 62g-62k) -- `fallow audit`'s unused-type-export check
 * does not exempt an interface the way it exempts a value with no importer,
 * so a colocated fixture builder is the deterministic guard, not decoration.
 * Later slices' own hook tests are expected to reuse these builders instead
 * of re-declaring the same literal shape.
 */
function buildKeymapPanelResult(overrides: Partial<UseKeymapPanelResult> = {}): UseKeymapPanelResult {
  return {
    keymapLoadState: 'loaded',
    saveErrorMessage: null,
    sections: [],
    onRebind: () => {},
    onRevert: () => {},
    onResetToDefaults: () => {},
    ...overrides,
  };
}

/** Same reasoning as `buildKeymapPanelResult` above, for `UseChordCaptureResult`. */
function buildChordCaptureResult(overrides: Partial<UseChordCaptureResult> = {}): UseChordCaptureResult {
  return {
    isArmed: false,
    candidateChord: null,
    arm: () => {},
    onKeyDown: () => {},
    onBlur: () => {},
    ...overrides,
  };
}

describe('KeymapPanelProps', () => {
  it('accepts an empty props object, since source is optional', () => {
    const props: KeymapPanelProps = {};

    expect(props.source).toBeUndefined();
  });

  it('accepts an injected source narrowed to setKeymap only', () => {
    const props: KeymapPanelProps = { source: { setKeymap: () => Promise.resolve('ok') } };

    expect(typeof props.source?.setKeymap).toBe('function');
  });
});

describe('UseKeymapPanelResult', () => {
  it('builds a minimal result with the fields KeymapPanel will read', () => {
    const result = buildKeymapPanelResult({ keymapLoadState: 'pending' });

    expect(result.keymapLoadState).toBe('pending');
    expect(result.saveErrorMessage).toBeNull();
    expect(result.sections).toEqual([]);
  });
});

describe('UseChordCaptureResult', () => {
  it('builds a minimal armed result with a recorded candidate chord', () => {
    const result = buildChordCaptureResult({ isArmed: true, candidateChord: 'ctrl+1' });

    expect(result.isArmed).toBe(true);
    expect(result.candidateChord).toBe('ctrl+1');
  });
});
