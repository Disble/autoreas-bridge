import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PickerSource } from '../../../../../shared/contracts/picker.types';
import type { SeasonSource } from '../../../../../shared/contracts/season.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { INTAKE_FOLDER_PICKER_FAILED_MESSAGE, INTAKE_FOLDER_PICKER_TITLE } from '../intake-panel.constants';
import { useIntakeCreationCallbacks } from '../use-intake-creation-callbacks';
import { useIntakeEditorState } from '../use-intake-editor-state';
import type { useIntakeMetadataView } from '../use-intake-metadata-view';
import type { useIntakeStoreSlice } from '../use-intake-store-slice';
import { createSource } from './intake-panel.test-support';

/** The toast spies a failed folder dialog reports through. */
const toastMock = vi.hoisted(() => ({ danger: vi.fn() }));

vi.mock('@heroui/react', () => ({ toast: toastMock }));

/**
 * Builds the picker port double, cancelling unless a case says otherwise.
 * @param pickFolder The folder-picker answer the case drives.
 * @returns A picker port whose file picker is never used here.
 */
function createPicker(pickFolder = vi.fn().mockResolvedValue('')): PickerSource {
  return { pickFolder, pickFile: vi.fn() };
}

/** The creation action the harness observes, resolving like the real store. */
type CreateSeasonAnimes = ReturnType<typeof useIntakeStoreSlice>['createSeasonAnimes'];

/**
 * Builds a creation-action spy the harness hands to the callbacks.
 * @returns A store-shaped creation spy resolving like the real action.
 */
function createCreateSpy(): CreateSeasonAnimes {
  return vi.fn().mockResolvedValue('ok') as unknown as CreateSeasonAnimes;
}

/** The ports one render of the creation callbacks reads. */
interface CreationCallbacksProps {
  /** The season port the Create action goes through. */
  readonly currentSource: SeasonSource;
  /** The picker port the folder override goes through. */
  readonly currentPicker: PickerSource;
}

/**
 * Renders the creation callbacks over a real editor state, so each case drives
 * selection and overrides exactly like the panel does.
 * @param source The season port the callbacks call into.
 * @param createSeasonAnimes The creation-action spy the store slice exposes.
 * @param picker The picker port the folder override goes through.
 * @returns The hook result plus the collaborators the case asserts on.
 */
function renderCreationCallbacks(source: SeasonSource, createSeasonAnimes: CreateSeasonAnimes, picker: PickerSource = createPicker()) {
  return renderHook(({ currentSource, currentPicker }: CreationCallbacksProps) => {
    const editor = useIntakeEditorState();
    const metadata = { heldByRow: {} } as unknown as ReturnType<typeof useIntakeMetadataView>;
    const store = { createSeasonAnimes } as unknown as ReturnType<typeof useIntakeStoreSlice>;
    const callbacks = useIntakeCreationCallbacks({ editor, metadata, store, source: currentSource, pickerSource: currentPicker });
    return { editor, callbacks };
  }, { initialProps: { currentSource: source, currentPicker: picker } });
}

describe('useIntakeCreationCallbacks', () => {
  it('creates nothing while nothing is selected', async () => {
    const createSeasonAnimes = createCreateSpy();
    const source = createSource();
    const { result } = renderCreationCallbacks(source, createSeasonAnimes);

    await act(async () => {
      result.current.callbacks.onCreate();
    });

    expect(createSeasonAnimes).not.toHaveBeenCalled();
  });

  it('creates the selected rows with their overrides and clears the selection', async () => {
    const createSeasonAnimes = createCreateSpy();
    const source = createSource();
    const { result } = renderCreationCallbacks(source, createSeasonAnimes);

    act(() => {
      result.current.editor.setSelected(new Set(['sa-1', 'sa-2']));
    });
    act(() => {
      result.current.editor.setFolderOverrides({ 'sa-2': 'E:/Custom/Naruto S2' });
    });
    await act(async () => {
      result.current.callbacks.onCreate();
    });

    expect(createSeasonAnimes).toHaveBeenCalledWith(
      source,
      ['sa-1', 'sa-2'],
      { 'sa-2': 'E:/Custom/Naruto S2' },
      {},
    );
    expect(result.current.editor.selected.size).toBe(0);
  });

  it('picks the folder through the current picker after it changes', async () => {
    const createSeasonAnimes = createCreateSpy();
    const source = createSource();
    const firstPicker = createPicker(vi.fn().mockResolvedValue('E:/First'));
    const nextPicker = createPicker(vi.fn().mockResolvedValue('E:/Next'));
    const { result, rerender } = renderCreationCallbacks(source, createSeasonAnimes, firstPicker);

    rerender({ currentSource: source, currentPicker: nextPicker });
    await act(async () => {
      result.current.callbacks.onPickFolder('sa-1');
    });

    expect(nextPicker.pickFolder).toHaveBeenCalledExactlyOnceWith(INTAKE_FOLDER_PICKER_TITLE);
    expect(firstPicker.pickFolder).not.toHaveBeenCalled();
    expect(result.current.editor.folderOverrides['sa-1']).toBe('E:/Next');
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it('records nothing and stays silent when the folder dialog is cancelled', async () => {
    toastMock.danger.mockClear();
    const { result } = renderCreationCallbacks(createSource(), createCreateSpy(), createPicker());

    await act(async () => {
      result.current.callbacks.onPickFolder('sa-1');
    });

    expect(result.current.editor.folderOverrides).toEqual({});
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it.each([
    ['the bridge reason', createBridgeError('internal', 'shell: the folder dialog failed'), 'shell: the folder dialog failed'],
    ['the fallback without a reason', createBridgeError('internal', ''), INTAKE_FOLDER_PICKER_FAILED_MESSAGE],
  ])('records nothing and toasts %s when the folder dialog fails', async (_name, failure, message) => {
    toastMock.danger.mockClear();
    const picker = createPicker(vi.fn().mockRejectedValue(failure));
    const { result } = renderCreationCallbacks(createSource(), createCreateSpy(), picker);

    await act(async () => {
      result.current.callbacks.onPickFolder('sa-1');
    });

    expect(result.current.editor.folderOverrides).toEqual({});
    expect(toastMock.danger).toHaveBeenCalledExactlyOnceWith(message);
  });

  it('creates through the current source after it changes', async () => {
    const createSeasonAnimes = createCreateSpy();
    const firstSource = createSource();
    const nextSource = createSource();
    const picker = createPicker();
    const { result, rerender } = renderCreationCallbacks(firstSource, createSeasonAnimes, picker);

    rerender({ currentSource: nextSource, currentPicker: picker });
    act(() => {
      result.current.editor.setSelected(new Set(['sa-1']));
    });
    await act(async () => {
      result.current.callbacks.onCreate();
    });

    expect(createSeasonAnimes).toHaveBeenCalledWith(nextSource, ['sa-1'], {}, {});
  });
});
