import { useCallback, useEffect, useRef, useState } from 'react';
import type { EpisodeDurationSaveResult } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeDurationEdit } from '../../../../shared/contracts/anime.types';
import { saveEpisodeDurationEdits, settleEpisodeDurationsSave } from './episode-durations-draft.helpers';
import { EPISODE_DURATIONS_EMPTY_DRAFT } from './episode-durations-section.constants';
import type { EpisodeDurationsDraftState, UseEpisodeDurationsDraftOptions } from './episode-durations-section.types';

/**
 * Owns the Episodes card's own draft (S15): its edits, its Save and its Discard
 * changes, apart from the anime data. Selecting another anime starts an empty
 * draft, and a save that settles after that move never lands on the new anime.
 */
export function useEpisodeDurationsDraft(options: Readonly<UseEpisodeDurationsDraftOptions>) {
  // 1. Refs
  const latestSave = useRef<object | undefined>(undefined);
  const { animeId, source } = options;

  // 2. State
  const [draft, setDraft] = useState<EpisodeDurationsDraftState>(EPISODE_DURATIONS_EMPTY_DRAFT);
  const [seenAnimeId, setSeenAnimeId] = useState(animeId);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (render-phase reset when the Editor moves to another anime)
  if (animeId !== seenAnimeId) {
    setSeenAnimeId(animeId);
    setDraft(EPISODE_DURATIONS_EMPTY_DRAFT);
  }
  const isDirty = draft.edits.length > 0;

  // 6. Callbacks (useCallback calling pure helpers)
  // Stryker disable ArrayDeclaration: these deps arrays are mutation-equivalent whether they are `[]`
  // or a fixed literal such as `["Stryker was here"]`: React compares dependency arrays element by
  // element with `Object.is`, and the callbacks close over a state setter only, so their identity
  // stays stable across rerenders under either one and no test can observe the difference.
  /** Replaces the card's edits; the table, the modals and the review compute the full list. */
  const onEditsChange = useCallback((edits: readonly EpisodeDurationEdit[]) => {
    setDraft((current) => ({ ...current, edits }));
  }, []);
  /** Drops the card's edits and its last save failure. */
  const onDiscard = useCallback(() => {
    setDraft((current) => ({ ...current, edits: [], saveError: undefined }));
  }, []);
  // Stryker restore ArrayDeclaration
  const onSave = useCallback(async (): Promise<EpisodeDurationSaveResult | undefined> => {
    if (animeId === undefined || draft.edits.length === 0) return undefined;
    const run = {};
    latestSave.current = run;
    setDraft((current) => ({ ...current, isSaving: true, saveError: undefined }));
    const result = await saveEpisodeDurationEdits(source, animeId, draft.edits);
    if (latestSave.current === run) setDraft((current) => settleEpisodeDurationsSave(current, result));
    return result;
  }, [animeId, draft.edits, source]);

  // 7. Effects
  useEffect(() => () => {
    latestSave.current = undefined;
  }, [animeId]);

  return { ...draft, isDirty, onEditsChange, onDiscard, onSave };
}
