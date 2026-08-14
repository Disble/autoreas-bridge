import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { moveOrderingCard } from '../../ordering.helpers';
import { buildInitialAnimeScheduleOrderingState, reconcileDraftEntries } from './anime-schedule-ordering.helpers';
import type { AnimeScheduleOrderingProps, AnimeScheduleOrderingState } from './anime-schedule-ordering.types';

/**
 * Keeps the draft in step with the props that own it: a new board rebuilds it,
 * changed create-mode rows reconcile into it, a test driver binds to it, and the
 * origin card scrolls into view. Split out of `useAnimeScheduleOrdering` so the
 * effects do not share a hook budget with the projection and the callbacks.
 * @param props The component contract driving the draft.
 * @param setState The draft state setter owned by the parent hook.
 */
export function useAnimeScheduleDraftSync(
  props: Readonly<AnimeScheduleOrderingProps>,
  setState: Dispatch<SetStateAction<AnimeScheduleOrderingState>>,
): void {
  useEffect(() => {
    setState(buildInitialAnimeScheduleOrderingState(props));
    // eslint-disable-next-line react-doctor/exhaustive-deps
  }, [props.board]);
  useEffect(() => {
    setState((current) => reconcileDraftEntries(current, props.draftEntries));
  }, [props.draftEntries, setState]);
  useEffect(() => {
    const testDriverRef = props.testDriverRef;
    if (testDriverRef === undefined) {
      return undefined;
    }
    testDriverRef.current = {
      moveAnime(command) {
        setState((current) => moveOrderingCard(current, command));
      },
    };
    return () => {
      testDriverRef.current = undefined;
    };
  }, [props.testDriverRef, setState]);
  useEffect(() => {
    Array.from(document.querySelectorAll<HTMLElement>('[data-origin-anime]'))
      .find((element) => element.dataset.originAnime === props.board.originAnimeId)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [props.board.originAnimeId]);
}
