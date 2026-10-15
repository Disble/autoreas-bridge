import { useState } from 'react';
import type { AppliedMetadata } from '../../../../shared/metadata-lookup/metadata-lookup.types';
import type { IntakeMetadataPatch, IntakeMode } from './intake-panel.types';

/**
 * useIntakeEditorState owns the intake panel's local editor state: the Raw/List
 * mode and its draft, the creation selection, the per-row folder overrides, the
 * configured downloads root, and the session's per-row metadata (the held patch
 * plus the applied record that lets Undo replay the row's pre-image). Split out
 * of `useIntakePanel` so the composer carries no `useState` calls itself.
 * @returns Every editor state value with its setter.
 */
export function useIntakeEditorState() {
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

  return {
    mode,
    setMode,
    rawDraft,
    setRawDraft,
    selected,
    setSelected,
    folderOverrides,
    setFolderOverrides,
    downloadsRoot,
    setDownloadsRoot,
    metadataByRow,
    setMetadataByRow,
    appliedMetadataByRow,
    setAppliedMetadataByRow,
  };
}
