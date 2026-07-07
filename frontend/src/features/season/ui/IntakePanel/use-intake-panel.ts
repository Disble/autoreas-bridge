import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';
import { INTAKE_RECONCILE_DEBOUNCE_MS } from './intake-panel.constants';
import { buildRawText, countUnresolved, isCreatableRow, splitIntakeRows } from './intake-panel.helpers';
import type { IntakeMode } from './intake-panel.types';

/**
 * useIntakePanel drives the dual-mode intake editor. Raw mode is a local draft
 * of the uncreated names that reconciles into the intake rows after a debounce;
 * List mode renders the editable rows plus a read-only "already created"
 * section. All Wails I/O flows through the season store.
 */
export function useIntakePanel(source: SeasonSource = seasonSource) {
  // 2. State
  const [mode, setMode] = useState<IntakeMode>('list');
  const [rawDraft, setRawDraft] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const reconcileIntake = useSeasonStore((state) => state.reconcileIntake);
  const runMatching = useSeasonStore((state) => state.runMatching);
  const resolveMatch = useSeasonStore((state) => state.resolveMatch);
  const discardName = useSeasonStore((state) => state.discardName);
  const createSeasonAnimes = useSeasonStore((state) => state.createSeasonAnimes);

  // 5. Derived State (useMemo)
  const { editable } = useMemo(() => splitIntakeRows(seasonAnimes), [seasonAnimes]);
  const unresolvedCount = useMemo(() => countUnresolved(editable), [editable]);
  const availableCount = useMemo(() => editable.filter(isCreatableRow).length, [editable]);

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
  const onCreate = useCallback(() => {
    if (selected.size === 0) {
      return;
    }
    const ids = [...selected];
    setSelected(new Set());
    void createSeasonAnimes(source, ids);
  }, [selected, createSeasonAnimes, source]);

  // 7. Effects
  useEffect(() => {
    void refreshAnimes(source);
  }, [refreshAnimes, source]);

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
    mode,
    switchMode,
    rawDraft,
    onRawChange,
    editableRows: editable,
    selected,
    toggleSelect,
    availableCount,
    onCreate,
    unresolvedCount,
    errorMessage,
    onRunMatching,
    onResolve,
    onDiscard,
  };
}
