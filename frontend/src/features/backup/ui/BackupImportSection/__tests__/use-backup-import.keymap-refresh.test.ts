import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupImportPreviewDTO, BackupImportResultDTO } from '../../../../../infrastructure/backup-source/backup-source.types';
import { preferencesSource } from '../../../../../infrastructure/preferences-source/preferences-source.helpers';
import { dispatchKeyboardEvent } from '../../../../../shared/keyboard/dispatch.helpers';
import type { KeyboardDispatchEvent } from '../../../../../shared/keyboard/dispatch.helpers';
import {
  getKeyboardState,
  popKeyboardScopeFrame,
  pushKeyboardScopeFrame,
  resetKeyboardStore,
  setKeymapOverrides,
} from '../../../../../shared/keyboard/keyboard-scope.helpers';
import type { CommandDefinition } from '../../../../../shared/keyboard/keyboard.types';
import { useBackupImport } from '../use-backup-import';

vi.mock('../../../../../infrastructure/preferences-source/preferences-source.helpers', () => ({
  preferencesSource: { getKeymap: vi.fn() },
}));

/**
 * Mandatory end-to-end proof for the "A Restored Keymap Reaches The Running
 * Dispatcher Without A Restart" requirement. Unlike `use-backup-import.test.ts`,
 * this file does NOT mock `keymap-load.helpers`: the real `loadKeymapOverrides`
 * must run so the observable is genuine chord resolution, not a mocked call.
 * Only the preferences runtime source is faked, at its `getKeymap` seam.
 */

/** Builds a valid preview DTO carrying only the keyboard_keymap group, the shape a confirm needs to run. */
function buildKeymapPreview(): BackupImportPreviewDTO {
  return {
    cancelled: false,
    bundlePath: 'C:/backups/keymap-only.zip',
    formatVersion: 1,
    bridgeVersion: 'dev',
    createdAt: '2026-09-11T00:00:00Z',
    bundleChecksum: 'deadbeef',
    groups: [{ name: 'keyboard_keymap', recordCount: 1 }],
    unknownGroups: [],
    absentGroups: [],
    versionNotes: [],
  };
}

/** Builds a valid apply-result DTO reporting a successful keyboard_keymap-only import. */
function buildKeymapResult(): BackupImportResultDTO {
  return {
    importedGroups: [{ name: 'keyboard_keymap', recordCount: 1 }],
    failedGroup: '',
    unattemptedGroups: [],
    restorePointPath: 'C:/data/bridge-restore-point.db',
    errorMessage: '',
  };
}

/** Builds a minimal global-scope command for the dispatcher proof, overriding only what a case needs. */
function buildTestCommand(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return {
    id: 'test.command',
    scope: 'global',
    chord: 'ctrl+shift+q',
    label: 'Test',
    section: 'Navigation',
    run: () => {},
    ...overrides,
  };
}

/** Builds the dispatchable keydown-shaped event for the shared test chord, `ctrl+shift+t`. */
function buildSharedChordEvent(): KeyboardDispatchEvent {
  return {
    key: 't',
    code: 'KeyT',
    ctrlKey: true,
    altKey: false,
    shiftKey: true,
    metaKey: false,
    defaultPrevented: false,
    isComposing: false,
    target: null,
    preventDefault: () => {},
  };
}

afterEach(() => {
  resetKeyboardStore();
  vi.clearAllMocks();
});

describe('a restored keymap reaches the running dispatcher without a restart', () => {
  it('rebinds the same chord from command A to command B right after a carrying import, with no restart', async () => {
    const runA = vi.fn();
    const runB = vi.fn();
    const commandA = buildTestCommand({ id: 'test.command-a', chord: 'ctrl+shift+q', run: runA });
    const commandB = buildTestCommand({ id: 'test.command-b', chord: 'ctrl+shift+w', run: runB });
    const frameId = 999901;
    pushKeyboardScopeFrame({ id: frameId, scope: 'global', getCommands: () => [commandA, commandB] });

    const sharedChord = 'ctrl+shift+t';
    // Seed: the shared chord is bound to command A via an override, in the
    // running session -- mirroring a user who already rebound it once.
    setKeymapOverrides({ [commandA.id]: sharedChord });

    dispatchKeyboardEvent(buildSharedChordEvent(), { navigate: vi.fn() });
    expect(runA).toHaveBeenCalledTimes(1);
    expect(runB).not.toHaveBeenCalled();

    // A bundle's keyboard_keymap group rebinds the SAME chord to command B.
    const restoredDocument = JSON.stringify({ version: 1, bindings: { [commandB.id]: sharedChord } });
    vi.mocked(preferencesSource.getKeymap).mockResolvedValue(restoredDocument);

    const previewBackupImport = vi.fn().mockResolvedValue(buildKeymapPreview());
    const confirmBackupImport = vi.fn().mockResolvedValue(buildKeymapResult());
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport }));

    act(() => {
      result.current.onPreview();
    });
    await waitFor(() => expect(result.current.phase).toBe('previewed'));

    act(() => {
      result.current.onConfirm();
    });
    await waitFor(() => expect(result.current.phase).toBe('applied'));

    // The real loadKeymapOverrides has published the restored document into
    // the real keyboardStore -- proven by the store's own state, not by a
    // mocked loader having been called.
    await waitFor(() => expect(getKeyboardState().overrides).toEqual({ [commandB.id]: sharedChord }));

    // Dispatching the exact same chord again, through the real dispatcher,
    // must now resolve to command B -- not command A -- with no reload or
    // restart in between.
    dispatchKeyboardEvent(buildSharedChordEvent(), { navigate: vi.fn() });

    popKeyboardScopeFrame(frameId);

    expect(runB).toHaveBeenCalledTimes(1);
    expect(runA).toHaveBeenCalledTimes(1); // unchanged since the first dispatch
  });
});
