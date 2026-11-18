import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PickerSource } from '../../../../../shared/contracts/picker.types';
import type { SeasonSource } from '../../../../../shared/contracts/season.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { INTAKE_FOLDER_PICKER_FAILED_MESSAGE, INTAKE_FOLDER_PICKER_TITLE } from '../intake-panel.constants';
import { useIntakeCreationCallbacks } from '../use-intake-creation-callbacks';
import { useIntakeEditorState } from '../use-intake-editor-state';
import type { useIntakeMetadataView } from '../use-intake-metadata-view';
import type { useIntakeStoreSlice } from '../use-intake-store-slice';
import { createSource } from './intake-panel.test-support';
import { seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { seasonStore } from '../../../../../shared/store/season-store/season-store.store';
import { useIntakeCommands } from '../use-intake-commands';

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

describe('useIntakeCommands', () => {
  afterEach(() => resetSeasonStore());

  it.each([
    ['reconcileIntake', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.reconcileIntake(s, 'raw')],
    ['resolveMatch', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.resolveMatch(s, 'row', 'url')],
    ['discardName', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.discardName(s, 'row')],
    ['restoreName', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.restoreName(s, 'row')],
    ['setSeasonAnimeMetadata', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.setSeasonAnimeMetadata(s, 'row', '{}')],
    ['createSeasonAnimes', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.createSeasonAnimes(s, ['row'], {}, {})],
    ['recheckAvailability', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.recheckAvailability(s)],
  ] as const)('runs and refreshes %s once', async (name, invoke) => {
    const source = createSource();
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    await act(async () => { await invoke(result.current, source); });
    expect(source[name]).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes successful matching only when no run started', async () => {
    const source = createSource();
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    await act(() => result.current.runMatching(source));
    expect(refetch).toHaveBeenCalledTimes(1);
    setSeasonStoreState({ matchingRun: { total: 1, resolvedInPhase: 0, phase: 'name_matching' } });
    await act(() => result.current.runMatching(source));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not refresh live rows if the user enters history while the command runs', async () => {
    let release: (value: string) => void = () => undefined;
    const source = createSource({ reconcileIntake: vi.fn().mockReturnValue(new Promise<string>((resolve) => { release = resolve; })) });
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    let pending: Promise<void>;
    await act(async () => { pending = result.current.reconcileIntake(source, 'raw'); await Promise.resolve(); });
    setSeasonStoreState({ viewSeasonId: 'past', readOnly: true });
    await act(async () => { release('ok'); await pending; });
    expect(refetch).not.toHaveBeenCalled();
  });

  it('records discard after the refreshed rows settle', async () => {
    const source = createSource();
    let release: () => void = () => undefined;
    const refetch = vi.fn().mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    let pending: Promise<boolean>;
    await act(async () => { pending = result.current.discardName(source, 'row-1'); await Promise.resolve(); });
    expect(getSeasonStoreState().lastDiscard).toBeNull();
    await act(async () => { release(); await pending; });
    expect(getSeasonStoreState().lastDiscard).toMatchObject({ rowId: 'row-1', sequence: 1 });
  });

  it('drops the matching run and its progress on command failure without refreshing', async () => {
    const source = createSource({ runMatching: vi.fn().mockResolvedValue('failed') });
    const refetch = vi.fn();
    setSeasonStoreState({ matchingRun: { total: 1, resolvedInPhase: 0, phase: 'name_matching' } });
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    await act(() => result.current.runMatching(source));
    await waitFor(() => expect(getSeasonStoreState().matchingRun).toBeNull());
    expect(getSeasonStoreState().matchingProgress).toEqual({});
    expect(getSeasonStoreState().errorMessage).toBe('failed');
    expect(refetch).not.toHaveBeenCalled();
  });

  /**
   * Pins who may own the shared busy message: the matching run, the anime
   * creation and the availability recheck announce themselves while they run
   * and clear it once settled.
   */
  it.each([
    ['runMatching', 'Matching names against jkanime…', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.runMatching(s)],
    ['createSeasonAnimes', 'Creating animes…', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.createSeasonAnimes(s, ['row'], {}, {})],
    ['recheckAvailability', 'Checking episode availability…', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.recheckAvailability(s)],
  ] as const)('announces %s on the shared busy message while it runs', async (method, message, call) => {
    let release: (value: never) => void = () => undefined;
    const source = createSource({ [method]: vi.fn().mockReturnValue(new Promise<never>((resolve) => { release = resolve; })) });
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });

    let running: Promise<void>;
    await act(async () => { running = call(result.current, source); await Promise.resolve(); });
    expect(getSeasonStoreState().busyMessage).toBe(message);
    await act(async () => { release('ok' as never); await running; });
    expect(getSeasonStoreState().busyMessage).toBeUndefined();
  });

  /** Pins that the short intake commands never claim the shared busy message. */
  it('leaves the busy message alone for the short intake commands', async () => {
    const source = createSource();
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    const seen: (string | undefined)[] = [];
    const stop = seasonStore.subscribe((state, previous) => { if (state.busyMessage !== previous.busyMessage) seen.push(state.busyMessage); });

    await act(async () => {
      await result.current.reconcileIntake(source, 'raw');
      await result.current.resolveMatch(source, 'row', 'url');
      await result.current.discardName(source, 'row');
      await result.current.restoreName(source, 'row');
      await result.current.setSeasonAnimeMetadata(source, 'row', '{}');
    });
    stop();
    expect(seen).toEqual([]);
  });
});
