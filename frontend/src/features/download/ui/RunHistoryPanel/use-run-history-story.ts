import { useEffect, useState } from 'react';
import type { DownloadRunView } from '../../../../shared/contracts/download.types';
import { RUN_HISTORY_STORY_LOADING, RUN_HISTORY_STORY_REFRESH_DEBOUNCE_MS } from './run-history-panel.constants';
import type { RunHistoryStorySource, RunHistoryStoryState } from './run-history-panel.types';
import { isStoredRowOfRun } from './run-history-story.helpers';

/** The story state together with the run it belongs to, so a stale answer is never shown for another run. */
interface StoryEntry {
  readonly runId?: string;
  readonly state: RunHistoryStoryState;
}

/**
 * Reads the selected run's stored steps through the run-story port. A finished
 * run is read once per selection. A running run is read again whenever its
 * record changes: the download store replaces the run history on every
 * `download.*` event, so the panel's existing event subscription drives the
 * refresh and nothing polls. Either kind is also read again once rows of that
 * run are stored: the eventlog persists a run's steps after the events that
 * announce them, so `download.run_finished` can arrive before the last ones
 * are readable. A refresh keeps the previous story on screen until the new one
 * arrives.
 *
 * @param run The selected run, if any.
 * @param storySource The run-story port; without it the story is unavailable.
 * @returns Where the selected run's story stands.
 */
export function useRunHistoryStory(run: DownloadRunView | undefined, storySource: RunHistoryStorySource | undefined): RunHistoryStoryState {
  // 1. Refs

  // 2. State
  const [entry, setEntry] = useState<StoryEntry>({ state: RUN_HISTORY_STORY_LOADING });
  // Counts the bursts of the selected run's rows stored since it was selected; each one re-reads the story.
  const [storedRowsVersion, setStoredRowsVersion] = useState(0);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const runId = run?.runId;
  // A live run's record is a new object after every download event; a finished one only changes status once.
  const refreshToken = run?.status === 'running' ? run : run?.status;

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    const subscribeRecorder = storySource?.subscribeRecorder;

    if (runId === undefined || subscribeRecorder === undefined) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeRecorder((row) => {
      if (!isStoredRowOfRun(row, runId)) {
        return;
      }

      clearTimeout(timer);
      // Stryker disable next-line ArithmeticOperator: equivalent; `version - 1` changes the version as surely, and only the change is read.
      timer = setTimeout(() => setStoredRowsVersion((version) => version + 1), RUN_HISTORY_STORY_REFRESH_DEBOUNCE_MS);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [runId, storySource]);

  useEffect(() => {
    if (runId === undefined) {
      return;
    }

    if (storySource === undefined) {
      // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- The story is async state keyed by the selected run.
      setEntry({ runId, state: { status: 'error' } });
      return;
    }

    let active = true;
    void storySource
      .getRunStory(runId)
      .then((story) => {
        if (active) {
          setEntry({ runId, state: { status: 'ready', story } });
        }
      })
      .catch(() => {
        if (active) {
          setEntry((previous) => (previous.runId === runId && previous.state.status === 'ready' ? previous : { runId, state: { status: 'error' } }));
        }
      });

    return () => {
      active = false;
    };
  }, [runId, refreshToken, storedRowsVersion, storySource]);

  return entry.runId === runId ? entry.state : RUN_HISTORY_STORY_LOADING;
}
