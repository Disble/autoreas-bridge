import { useCallback, useMemo, useState } from 'react';
import { createActivitySource } from '../../activity-source/activity-source.helpers';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import { readActivityRunStory, toActivityRunMetadata, toActivityRunStoryModel, toActivitySelectedStepId, toggleActivityRawOpen } from './activity-run-story.helpers';
import type { ActivityChosenStep } from './activity-run-story.types';
import { toActivityReadValue } from './activity-time.helpers';
import { useActivityCopy } from './use-activity-copy';
import { useActivityRead } from './use-activity-read';

/**
 * Owns one run story: a single `GetActivityRunStory` read per correlation id
 * (and per "Try again"), the selected step, its raw metadata toggle and "Copy
 * for AI". An answer for a run no longer shown is dropped. The story opens on
 * its first error, else its first warning, else its first step.
 *
 * @param correlationId The run to read.
 * @param source The Activity port; the shared Wails source when omitted.
 * @returns The read, its worded model, the selected step with its recorded detail, and the actions.
 */
export function useActivityRunStory(correlationId: string, source: ActivitySource = createActivitySource()) {
  // 1. Refs

  // 2. State
  const [chosen, setChosen] = useState<ActivityChosenStep | undefined>();
  const [rawOpenFor, setRawOpenFor] = useState<number | undefined>();

  // 3. Context/3rd Party Hooks
  const { copy } = useActivityCopy();

  // 4. Queries/Mutations
  const { read, retry } = useActivityRead(source, correlationId, readActivityRunStory);

  // 5. Derived State (useMemo)
  const story = toActivityReadValue(read);
  const model = useMemo(() => (story === undefined ? undefined : toActivityRunStoryModel(story)), [story]);
  const steps = story?.steps;
  const selectedStepId = toActivitySelectedStepId(chosen, correlationId, steps ?? []);
  const selectedStep = steps?.find((step) => step.id === selectedStepId);
  const metadata = useMemo(() => toActivityRunMetadata(selectedStep?.metadataJson ?? ''), [selectedStep]);
  const isRawOpen = selectedStepId !== undefined && rawOpenFor === selectedStepId;

  // 6. Callbacks (useCallback calling pure helpers)
  const selectStep = useCallback(
    (stepId: number) => {
      setChosen({ correlationId, stepId });
    },
    [correlationId],
  );

  const toggleRaw = useCallback(() => {
    setRawOpenFor((open) => toggleActivityRawOpen(open, selectedStepId));
  }, [selectedStepId]);

  const copyReference = useCallback(() => {
    if (model !== undefined) {
      copy(model.copyText);
    }
  }, [copy, model]);

  // 7. Effects

  return { read, model, selectedStepId, metadata, isRawOpen, selectStep, toggleRaw, retry, copyReference };
}
