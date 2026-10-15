import { metadataLookupSource } from '../../../../infrastructure/metadata-lookup-source/metadata-lookup-source.helpers';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import type { PreferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.types';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import type { AnimeMetadataLookupSource } from '../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';
import type { ProviderSearchPort } from './IntakeProviderLookup/intake-provider-lookup.types';
import { useIntakeCreationCallbacks } from './use-intake-creation-callbacks';
import { useIntakeEditorState } from './use-intake-editor-state';
import { useIntakeMatchingProgress } from './use-intake-matching-progress';
import { useIntakeMetadataApply } from './use-intake-metadata-apply';
import { useIntakeMetadataRevert } from './use-intake-metadata-revert';
import { useIntakeMetadataView } from './use-intake-metadata-view';
import { useIntakeModeCallbacks } from './use-intake-mode-callbacks';
import { useIntakeRowCallbacks } from './use-intake-row-callbacks';
import { useIntakeRows } from './use-intake-rows';
import { useIntakeStoreSlice } from './use-intake-store-slice';
import { useIntakeSyncEffects } from './use-intake-sync-effects';

/**
 * useIntakePanel drives the dual-mode intake editor. Raw mode is a local draft
 * of the uncreated names that reconciles into the intake rows after a debounce;
 * List mode renders the editable rows plus a read-only "already created"
 * section. All Wails I/O flows through the season store.
 *
 * It also holds the ONE thing a lookup leaves behind in this slice: the
 * metadata each row's confirmed MyAnimeList lookup attached, plus the applied
 * patch that lets its Undo replay the row's pre-image. Both live in this hook
 * for the session only -- nothing here persists them or sends them to creation
 * (that is a later work unit) -- and both are narrowed to the rows the intake
 * list still shows, so a row that is gone can never DISPLAY its lookup. The
 * narrowed-to records are not pruned: a row that comes back under the same id
 * (the reconcile path revives a discarded name with its original id) shows the
 * lookup that id already had, which is a display concern only while nothing is
 * persisted. Persisting these values, and deciding what a revived row may keep,
 * belongs to the storage work unit.
 *
 * The hook itself only composes the colocated slices below: editor state, the
 * Season store slice, the row and metadata derivations, the callback groups,
 * and the sync effects. Its returned object is the panel's whole contract.
 * @param source The season port every row mutation goes through.
 * @param libraryRootSource The port that supplies the configured library root.
 * @param metadataSource The two MyAnimeList calls each row's lookup modal drives.
 * @returns The panel's state, its derived counts and previews, and its callbacks.
 */
export function useIntakePanel(
  source: SeasonSource = seasonSource,
  libraryRootSource: Pick<PreferencesSource, 'getLibraryRoot'> = preferencesSource,
  metadataSource: AnimeMetadataLookupSource = metadataLookupSource,
) {
  // 2. State
  const editor = useIntakeEditorState();
  // 3. Context/3rd Party Hooks
  const store = useIntakeStoreSlice();
  // 5. Derived State (useMemo in colocated hooks)
  // The rows see only the provider search, never the whole season port.
  const providerSearchSource: ProviderSearchPort = source;
  const rows = useIntakeRows({ store, editor });
  const progress = useIntakeMatchingProgress({ store });
  const metadata = useIntakeMetadataView({ rows, editor });
  // 6. Callbacks (useCallback in colocated hooks)
  const modes = useIntakeModeCallbacks({ editor, store, source });
  const rowActions = useIntakeRowCallbacks({ store, editor, source });
  const creation = useIntakeCreationCallbacks({ editor, metadata, store, source });
  const applied = useIntakeMetadataApply({ rows, editor, metadata, store, source });
  const reverted = useIntakeMetadataRevert({ rows, editor, store, source });
  // 7. Effects
  useIntakeSyncEffects({ editor, store, source, libraryRootSource });

  return {
    readOnly: store.readOnly,
    mode: editor.mode,
    switchMode: modes.switchMode,
    rawDraft: editor.rawDraft,
    onRawChange: modes.onRawChange,
    editableRows: rows.editable,
    selected: editor.selected,
    toggleSelect: rowActions.toggleSelect,
    folderOverrides: editor.folderOverrides,
    folderPreviews: rows.folderPreviews,
    onPickFolder: creation.onPickFolder,
    metadataByRow: metadata.visibleMetadataByRow,
    appliedMetadataByRow: metadata.appliedMetadataView,
    metadataLookupSource: metadataSource,
    providerSearchSource,
    onMetadataApplied: applied.onMetadataApplied,
    onMetadataUndo: reverted.onMetadataUndo,
    onMetadataClear: reverted.onMetadataClear,
    availableCount: rows.availableCount,
    availabilityPendingCount: rows.availabilityPendingCount,
    onCreate: creation.onCreate,
    unresolvedCount: rows.unresolvedCount,
    searchFailedCount: rows.searchFailedCount,
    errorMessage: store.errorMessage,
    busyMessage: store.busyMessage,
    matchingRun: store.matchingRun,
    matchingProgressMessage: progress.matchingProgressMessage,
    onRunMatching: rowActions.onRunMatching,
    onRecheckAvailability: rowActions.onRecheckAvailability,
    onResolve: rowActions.onResolve,
    onDiscard: rowActions.onDiscard,
    onOpenPage: rowActions.onOpenPage,
  };
}
