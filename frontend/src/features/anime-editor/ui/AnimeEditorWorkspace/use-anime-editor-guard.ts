import { useBeforeUnload } from 'react-router';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { AnimeEditorSaveResult } from '../../../../shared/contracts/anime.types';
import { isIntentionalEditorOutcome, reduceAnimeEditorGuard } from './anime-editor-workspace.helpers';
import type { AnimeEditorPendingAction, UseAnimeEditorGuardOptions } from './anime-editor-workspace.types';

/** Coordinates selection, schedule, app navigation, history, and reload dirty guards. */
export function useAnimeEditorGuard(options: Readonly<UseAnimeEditorGuardOptions>) {
  // 1. Refs
  const dirtyRef = useRef(options.isDirty);
  const isDirty = options.isDirty;

  // 2. State
  const [state, dispatch] = useReducer(reduceAnimeEditorGuard, { pendingAction: undefined });

  // 3. Context/3rd Party Hooks
  useBeforeUnload(useCallback((event) => {
    if (isDirty) event.preventDefault();
  }, [isDirty]));

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const requestAction = useCallback((action: Exclude<AnimeEditorPendingAction, undefined>) => {
    if (isDirty) {
      dispatch({ type: 'request', action });
      return false;
    }
    return true;
  }, [isDirty]);
  const onStayWithCurrentEditor = useCallback(() => dispatch({ type: 'stay' }), []);
  const continueWithDiscard = useCallback(async (discard: () => void, execute: (action: Exclude<AnimeEditorPendingAction, undefined>) => Promise<void>) => {
    const action = state.pendingAction;
    if (action === undefined) return;
    discard();
    dispatch({ type: 'complete' });
    await execute(action);
  }, [state.pendingAction]);
  const continueWithSave = useCallback(async (save: () => Promise<AnimeEditorSaveResult | undefined>, execute: (action: Exclude<AnimeEditorPendingAction, undefined>) => Promise<void>) => {
    const action = state.pendingAction;
    if (action === undefined) return;
    const result = await save();
    if (result === undefined || !isIntentionalEditorOutcome(result)) return;
    dispatch({ type: 'complete' });
    await execute(action);
  }, [state.pendingAction]);

  // 7. Effects
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);
  useEffect(() => {
    function interceptAppLink(event: MouseEvent) {
      if (!dirtyRef.current || !(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const rawHref = anchor.getAttribute('href') ?? '';
      if (!rawHref.startsWith('/') && anchor.origin !== window.location.origin) return;
      event.preventDefault();
      dispatch({ type: 'request', action: { type: 'navigate', path: `${anchor.pathname}${anchor.search}${anchor.hash}` } });
    }
    document.addEventListener('click', interceptAppLink, true);
    return () => document.removeEventListener('click', interceptAppLink, true);
  }, []);
  useEffect(() => {
    function interceptHistoryBack() {
      if (!dirtyRef.current) return;
      window.history.forward();
      dispatch({ type: 'request', action: { type: 'history-back' } });
    }
    window.addEventListener('popstate', interceptHistoryBack);
    return () => window.removeEventListener('popstate', interceptHistoryBack);
  }, []);

  return { pendingAction: state.pendingAction, isGuardOpen: state.pendingAction !== undefined, requestAction, onStayWithCurrentEditor, continueWithDiscard, continueWithSave };
}
