import { useCallback, useMemo, useState } from 'react';
import { patchEpisodeForm, toAddedEpisodeEdit, toAppliedEpisodeEdit, toEpisodeEditForm, toEpisodeOpenEdit } from './episode-duration-forms.helpers';
import { clearEpisodeDuration, nextEpisodeNumber, toEpisodeAddFormView, upsertEpisodeEdit } from './episode-durations-section.helpers';
import type { EpisodeAddFormState, EpisodeEditFormState, UseEpisodeDurationFormsOptions } from './episode-durations-section.types';

/**
 * Owns the Edit episode and Add episode modals. Both write only to the draft:
 * Apply and Add put a manual edit, Clear duration puts a clear edit (or drops a
 * value that was never stored), and nothing is saved until the Editor's Save.
 */
export function useEpisodeDurationForms(options: Readonly<UseEpisodeDurationFormsOptions>) {
  // 1. Refs
  const { rows, edits, onEditsChange, isTV } = options;

  // 2. State
  const [editForm, setEditForm] = useState<EpisodeEditFormState | undefined>(undefined);
  const [addForm, setAddForm] = useState<EpisodeAddFormState | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const openEdit = useMemo(() => toEpisodeOpenEdit(editForm, rows), [editForm, rows]);
  const addView = useMemo(() => (addForm === undefined ? undefined : toEpisodeAddFormView(addForm, rows, isTV)), [addForm, isTV, rows]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onOpenEdit = useCallback((episode: number) => setEditForm(toEpisodeEditForm(rows, episode)), [rows]);
  // Stryker disable ArrayDeclaration: these deps arrays are mutation-equivalent whether they are `[]`
  // or a fixed literal such as `["Stryker was here"]`: React compares dependency arrays element by
  // element with `Object.is`, and these callbacks close over state setters only, so their identity
  // stays stable across rerenders under either one and no test can observe the difference.
  const onEditMinutesChange = useCallback((minutes: string) => setEditForm((current) => patchEpisodeForm(current, { minutes })), []);
  const onCloseEdit = useCallback(() => setEditForm(undefined), []);
  const onAddEpisodeChange = useCallback((episode: string) => setAddForm((current) => patchEpisodeForm(current, { episode })), []);
  const onAddMinutesChange = useCallback((minutes: string) => setAddForm((current) => patchEpisodeForm(current, { minutes })), []);
  const onCloseAdd = useCallback(() => setAddForm(undefined), []);
  // Stryker restore ArrayDeclaration
  const onApplyEdit = useCallback(() => {
    const edit = toAppliedEpisodeEdit(editForm);
    if (edit === undefined) return;
    onEditsChange(upsertEpisodeEdit(edits, edit));
    setEditForm(undefined);
  }, [editForm, edits, onEditsChange]);
  const onClearEdit = useCallback(() => {
    if (openEdit === undefined) return;
    onEditsChange(clearEpisodeDuration(edits, openEdit.row));
    setEditForm(undefined);
  }, [openEdit, edits, onEditsChange]);
  const onOpenAdd = useCallback(() => setAddForm({ episode: String(nextEpisodeNumber(rows)), minutes: '' }), [rows]);
  const onApplyAdd = useCallback(() => {
    const edit = toAddedEpisodeEdit(addForm, addView);
    if (edit === undefined) return;
    onEditsChange(upsertEpisodeEdit(edits, edit));
    setAddForm(undefined);
  }, [addForm, addView, edits, onEditsChange]);
  const onEditInstead = useCallback(() => {
    const episode = addView?.duplicateEpisode;
    if (episode === undefined) return;
    setAddForm(undefined);
    onOpenEdit(episode);
  }, [addView, onOpenEdit]);

  // 7. Effects

  return {
    editForm, editView: openEdit?.view, addForm, addView,
    onOpenEdit, onEditMinutesChange, onCloseEdit, onApplyEdit, onClearEdit,
    onOpenAdd, onAddEpisodeChange, onAddMinutesChange, onCloseAdd, onApplyAdd, onEditInstead,
  };
}
