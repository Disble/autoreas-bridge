import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EPISODE_ANALYSIS_IDLE, EPISODE_REANALYSIS_FAILED_REVIEW } from './episode-durations-section.constants';
import { toEpisodeErrorMessage } from './episode-durations-section.helpers';
import type { EpisodeAnalysisState, EpisodeOpenReview, UseEpisodeReanalysisOptions } from './episode-durations-section.types';
import { shouldOpenEpisodeReview, toEpisodeReviewEdits, toEpisodeReviewView } from './episode-reanalysis-review.helpers';

/**
 * Runs one re-analysis of the saved folder, follows its progress, and holds
 * the review the user confirms into the card draft (Log L15). Re-analysis writes
 * nothing; confirming only replaces the card's episode edits. A run started
 * for one anime never lands on another: moving the Editor to another anime
 * cancels it and drops its answer.
 */
export function useEpisodeReanalysis(options: Readonly<UseEpisodeReanalysisOptions>) {
  // 1. Refs
  const latestRun = useRef<object | undefined>(undefined);
  const isRunningRef = useRef(false);
  const { request, edits, onEditsChange, source } = options;
  const animeId = request?.animeId;

  // 2. State
  const [analysis, setAnalysis] = useState<EpisodeAnalysisState>(EPISODE_ANALYSIS_IDLE);
  const [openReview, setOpenReview] = useState<EpisodeOpenReview | undefined>(undefined);
  const [seenAnimeId, setSeenAnimeId] = useState(animeId);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (render-phase reset when the Editor moves to another anime)
  if (animeId !== seenAnimeId) {
    setSeenAnimeId(animeId);
    setAnalysis(EPISODE_ANALYSIS_IDLE);
    setOpenReview(undefined);
  }
  const review = useMemo(() => (openReview === undefined ? undefined : toEpisodeReviewView(openReview)), [openReview]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onReanalyze = useCallback(async () => {
    if (request === undefined) return;
    const run = {};
    latestRun.current = run;
    isRunningRef.current = true;
    setOpenReview(undefined);
    setAnalysis({ isRunning: true });
    const unsubscribe = source.onEpisodeReanalysisProgress((progress) => {
      if (latestRun.current === run && progress.animeId === request.animeId) setAnalysis({ isRunning: true, progress });
    });
    try {
      const result = await source.reanalyzeEpisodeDurations(request);
      if (latestRun.current === run && shouldOpenEpisodeReview(result)) setOpenReview({ review: result, folder: request.folder });
    } catch (error) {
      if (latestRun.current === run) {
        setOpenReview({ review: { ...EPISODE_REANALYSIS_FAILED_REVIEW, message: toEpisodeErrorMessage(error) }, folder: request.folder });
      }
    } finally {
      unsubscribe();
      if (latestRun.current === run) {
        isRunningRef.current = false;
        setAnalysis(EPISODE_ANALYSIS_IDLE);
      }
    }
  }, [request, source]);
  const onCancelAnalysis = useCallback(() => {
    void source.cancelEpisodeReanalysis();
  }, [source]);
  // Stryker disable ArrayDeclaration: this deps array is mutation-equivalent whether it is `[]`
  // or a fixed literal such as `["Stryker was here"]`: React compares dependency arrays element by
  // element with `Object.is`, and the callback closes over a state setter only, so its identity
  // stays stable across rerenders under either one and no test can observe the difference.
  const onCloseReview = useCallback(() => setOpenReview(undefined), []);
  // Stryker restore ArrayDeclaration
  const onConfirmReview = useCallback(() => {
    if (openReview === undefined) return;
    onEditsChange(toEpisodeReviewEdits(openReview.review, edits));
    setOpenReview(undefined);
  }, [edits, onEditsChange, openReview]);

  // 7. Effects
  useEffect(() => () => {
    latestRun.current = undefined;
    if (isRunningRef.current) {
      isRunningRef.current = false;
      void source.cancelEpisodeReanalysis();
    }
  }, [animeId, source]);

  return { analysis, review, onReanalyze, onCancelAnalysis, onCloseReview, onConfirmReview };
}
