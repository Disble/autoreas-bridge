import { useCallback, useEffect, useMemo, useState } from 'react';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import type { PreferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.types';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { INTAKE_FOLDER_PICKER_TITLE, INTAKE_RECONCILE_DEBOUNCE_MS } from './intake-panel.constants';
import {
  buildRawText,
  countMatchedWaitingForAvailability,
  countUnresolved,
  deriveIntakeDownloadFolder,
  isCreatableRow,
  splitIntakeRows,
} from './intake-panel.helpers';
import type { IntakeMode } from './intake-panel.types';

/**
 * useIntakePanel drives the dual-mode intake editor. Raw mode is a local draft
 * of the uncreated names that reconciles into the intake rows after a debounce;
 * List mode renders the editable rows plus a read-only "already created"
 * section. All Wails I/O flows through the season store.
 */
export function useIntakePanel(
  source: SeasonSource = seasonSource,
  downloadsRootSource: Pick<PreferencesSource, 'getDownloadsRoot'> = preferencesSource,
) {
  // 2. State
  const [mode, setMode] = useState<IntakeMode>('list');
  const [rawDraft, setRawDraft] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [folderOverrides, setFolderOverrides] = useState<Readonly<Record<string, string>>>({});
  const [downloadsRoot, setDownloadsRoot] = useState('');

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
  const folderPreviews = useMemo(() => {
    const previews: Record<string, string> = {};

    for (const row of editable) {
      if (Object.hasOwn(folderOverrides, row.id)) {
        const override = folderOverrides[row.id] ?? '';

        if (override !== '') {
          previews[row.id] = override;
          continue;
        }
      }

      const defaultFolder = deriveIntakeDownloadFolder(downloadsRoot, row.rawName);
      if (defaultFolder !== '') {
        previews[row.id] = defaultFolder;
      }
    }

    return previews;
  }, [downloadsRoot, editable, folderOverrides]);

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
  const toggleSelect = useCallback((rowId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
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
    const folders: Record<string, string> = {};

    for (const id of ids) {
      if (Object.hasOwn(folderOverrides, id)) {
        const override = folderOverrides[id] ?? '';

        if (override !== '') {
          folders[id] = override;
        }
      }
    }

    setSelected(new Set());
    void createSeasonAnimes(source, ids, folders);
  }, [selected, folderOverrides, createSeasonAnimes, source]);

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
  };
}
