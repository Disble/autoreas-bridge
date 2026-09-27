import { useCallback, useEffect, useMemo, useState } from 'react';
import { metadataLookupSource } from '../../../../infrastructure/metadata-lookup-source/metadata-lookup-source.helpers';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import type { PreferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.types';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { buildUndoPatch } from '../../../../shared/metadata-lookup/metadata-lookup.helpers';
import type {
  AnimeMetadataSelection,
  AppliedMetadata,
} from '../../../../shared/metadata-lookup/metadata-lookup.types';
import type { AnimeMetadataLookupSource } from '../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { INTAKE_FOLDER_PICKER_TITLE, INTAKE_RECONCILE_DEBOUNCE_MS } from './intake-panel.constants';
import {
  buildFolderPreviews,
  buildRawText,
  collectFolderOverrides,
  countMatchedWaitingForAvailability,
  countUnresolved,
  isCreatableRow,
  pickRowEntries,
  splitIntakeRows,
  toIntakeMetadataPatch,
  toggleSelection,
} from './intake-panel.helpers';
import type { IntakeMetadataPatch, IntakeMode } from './intake-panel.types';

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
 * @param source The season port every row mutation goes through.
 * @param downloadsRootSource The port that supplies the configured downloads root.
 * @param metadataSource The two MyAnimeList calls each row's lookup modal drives.
 * @returns The panel's state, its derived counts and previews, and its callbacks.
 */
export function useIntakePanel(
  source: SeasonSource = seasonSource,
  downloadsRootSource: Pick<PreferencesSource, 'getDownloadsRoot'> = preferencesSource,
  metadataSource: AnimeMetadataLookupSource = metadataLookupSource,
) {
  // 2. State
  const [mode, setMode] = useState<IntakeMode>('list');
  const [rawDraft, setRawDraft] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [folderOverrides, setFolderOverrides] = useState<Readonly<Record<string, string>>>({});
  const [downloadsRoot, setDownloadsRoot] = useState('');
  const [metadataByRow, setMetadataByRow] = useState<Readonly<Record<string, IntakeMetadataPatch>>>({});
  const [appliedMetadataByRow, setAppliedMetadataByRow] = useState<
    Readonly<Record<string, AppliedMetadata<IntakeMetadataPatch>>>
  >({});

  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const busyMessage = useSeasonStore((state) => state.busyMessage);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const reconcileIntake = useSeasonStore((state) => state.reconcileIntake);
  const runMatching = useSeasonStore((state) => state.runMatching);
  const resolveMatch = useSeasonStore((state) => state.resolveMatch);
  const discardName = useSeasonStore((state) => state.discardName);
  const createSeasonAnimes = useSeasonStore((state) => state.createSeasonAnimes);
  const recheckAvailability = useSeasonStore((state) => state.recheckAvailability);

  // 5. Derived State (useMemo)
  const { editable } = useMemo(() => splitIntakeRows(seasonAnimes), [seasonAnimes]);
  const unresolvedCount = useMemo(() => countUnresolved(editable), [editable]);
  const availableCount = useMemo(() => editable.filter(isCreatableRow).length, [editable]);
  const availabilityPendingCount = useMemo(() => countMatchedWaitingForAvailability(editable), [editable]);
  const folderPreviews = useMemo(
    () => buildFolderPreviews(downloadsRoot, editable, folderOverrides),
    [downloadsRoot, editable, folderOverrides],
  );
  const editableIds = useMemo(() => new Set(editable.map((row) => row.id)), [editable]);
  // Both records are narrowed to the rows still on screen rather than pruned in
  // an effect: a row that is gone cannot display its lookup, and a refresh that
  // keeps the same ids costs no state write at all. The underlying records keep
  // a departed row's entry, so an id that returns shows what it had before.
  const visibleMetadataByRow = useMemo(() => pickRowEntries(metadataByRow, editableIds), [metadataByRow, editableIds]);
  const visibleAppliedMetadataByRow = useMemo(
    () => pickRowEntries(appliedMetadataByRow, editableIds),
    [appliedMetadataByRow, editableIds],
  );

  // 6. Callbacks
  const switchMode = useCallback(
    (next: IntakeMode) => {
      if (next === mode) {
        return;
      }
      if (next === 'list' && mode === 'raw') {
        void reconcileIntake(source, rawDraft); // flush the draft before rendering
      }
      if (next === 'raw') {
        setRawDraft(buildRawText(seasonAnimes));
      }
      setMode(next);
    },
    [mode, rawDraft, seasonAnimes, reconcileIntake, source],
  );
  const onRawChange = useCallback((text: string) => {
    setRawDraft(text);
  }, []);
  const onRunMatching = useCallback(() => {
    void runMatching(source);
  }, [runMatching, source]);
  const onRecheckAvailability = useCallback(() => {
    void recheckAvailability(source);
  }, [recheckAvailability, source]);
  const onResolve = useCallback(
    (rowId: string, pageUrl: string) => {
      void resolveMatch(source, rowId, pageUrl);
    },
    [resolveMatch, source],
  );
  const onDiscard = useCallback(
    (rowId: string) => {
      void discardName(source, rowId);
    },
    [discardName, source],
  );
  const onOpenPage = useCallback(
    (pageUrl: string) => {
      source.openPage(pageUrl);
    },
    [source],
  );
  const toggleSelect = useCallback((rowId: string) => {
    setSelected((prev) => toggleSelection(prev, rowId));
  }, []);
  const onPickFolder = useCallback(
    (rowId: string) => {
      void source.pickFolder(INTAKE_FOLDER_PICKER_TITLE).then((picked) => {
        if (picked !== '') {
          setFolderOverrides((prev) => ({ ...prev, [rowId]: picked }));
        }
      });
    },
    [source],
  );
  const onCreate = useCallback(() => {
    if (selected.size === 0) {
      return;
    }
    const ids = [...selected];

    setSelected(new Set());
    void createSeasonAnimes(source, ids, collectFolderOverrides(ids, folderOverrides));
  }, [selected, folderOverrides, createSeasonAnimes, source]);
  /**
   * Attaches one confirmed lookup to its own row. The selection goes through
   * {@link toIntakeMetadataPatch}'s allow-list, so this can only ever write the
   * row's metadata -- never its download page, folder, watched episodes, estado
   * or first-watch date. A lookup for a row the intake list no longer shows is
   * refused rather than attached to nothing.
   *
   * Re-applying REPLACES the row's applied patch instead of stacking a second
   * one: the new patch's pre-image is read from what the row currently holds, so
   * a second Undo steps back to the first apply's values instead of leaving the
   * first patch behind.
   */
  const onMetadataApplied = useCallback(
    (rowId: string, selection: AnimeMetadataSelection) => {
      if (!editableIds.has(rowId)) {
        return;
      }
      const patch = toIntakeMetadataPatch(selection);
      const held: IntakeMetadataPatch = metadataByRow[rowId] ?? {};
      const previous = buildUndoPatch(held, patch);

      setMetadataByRow((current) => ({ ...current, [rowId]: { ...current[rowId], ...patch } }));
      setAppliedMetadataByRow((current) => ({
        ...current,
        [rowId]: {
          patch,
          previous,
          appliedFields: Object.keys(patch) as (keyof IntakeMetadataPatch)[],
          unfilled: selection.unfilled,
        },
      }));
    },
    [editableIds, metadataByRow],
  );
  /**
   * Reverts one row's last applied metadata patch, replaying the recorded
   * pre-image into the row's held metadata and dropping the row's Undo. A no-op
   * for a row with nothing applied.
   */
  const onMetadataUndo = useCallback(
    (rowId: string) => {
      const applied = appliedMetadataByRow[rowId];
      if (applied === undefined) {
        return;
      }
      setMetadataByRow((current) => ({ ...current, [rowId]: { ...current[rowId], ...applied.previous } }));
      setAppliedMetadataByRow((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => id !== rowId)),
      );
    },
    [appliedMetadataByRow],
  );

  // 7. Effects
  useEffect(() => {
    void refreshAnimes(source);
  }, [refreshAnimes, source]);

  useEffect(() => {
    void downloadsRootSource.getDownloadsRoot().then((root) => {
      setDownloadsRoot(root);
    });
  }, [downloadsRootSource]);

  // Debounced reconcile while editing the raw draft.
  useEffect(() => {
    if (mode !== 'raw') {
      return undefined;
    }
    const timer = setTimeout(() => {
      void reconcileIntake(source, rawDraft);
    }, INTAKE_RECONCILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [mode, rawDraft, reconcileIntake, source]);

  return {
    readOnly,
    mode,
    switchMode,
    rawDraft,
    onRawChange,
    editableRows: editable,
    selected,
    toggleSelect,
    folderOverrides,
    folderPreviews,
    onPickFolder,
    metadataByRow: visibleMetadataByRow,
    appliedMetadataByRow: visibleAppliedMetadataByRow,
    metadataLookupSource: metadataSource,
    onMetadataApplied,
    onMetadataUndo,
    availableCount,
    availabilityPendingCount,
    onCreate,
    unresolvedCount,
    errorMessage,
    busyMessage,
    onRunMatching,
    onRecheckAvailability,
    onResolve,
    onDiscard,
    onOpenPage,
  };
}
