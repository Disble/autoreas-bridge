import type { ActivityRunStep, ActivityRunStory } from '../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import { ACTIVITY_SUCCESS_EVENT_SUFFIXES } from './activity-run-story.constants';
import type { ActivityRunStoryModel, ActivityRunStoryRead, ActivityTone } from './activity-run-story.types';
import { formatActivityClock, formatActivityDuration } from './activity-time.helpers';

/**
 * Words a dotted event type, `download.hoster_retry` → `download hoster retry`.
 *
 * @param eventType The stored event type.
 * @returns The type in words.
 */
function wordActivityEventType(eventType: string): string {
  return eventType.replaceAll(/[._]/g, ' ');
}

/** The emphasis of one step: errors and warnings by level, finished steps by their type. */
function stepTone(step: ActivityRunStep): ActivityTone {
  if (step.level === 'error') {
    return 'danger';
  }
  if (step.level === 'warn') {
    return 'warning';
  }
  return ACTIVITY_SUCCESS_EVENT_SUFFIXES.some((suffix) => step.eventType.endsWith(suffix)) ? 'success' : 'default';
}

/** A step's message, or its type in words when it recorded none. */
function stepTitle(step: ActivityRunStep): string {
  return step.message === '' ? wordActivityEventType(step.eventType) : step.message;
}

/** The type in words, with the step's duration when one was recorded. */
function stepDetail(step: ActivityRunStep): string {
  const words = wordActivityEventType(step.eventType);
  return step.durationMs === undefined ? words : `${words} · ${formatActivityDuration(step.durationMs)}`;
}

/**
 * Words a run story for the dumb timeline: every step in recorded order.
 *
 * @param story The story Go returned.
 * @returns Everything the run story renders.
 */
export function toActivityRunStoryModel(story: ActivityRunStory): ActivityRunStoryModel {
  return {
    steps: story.steps.map((step) => ({ id: step.id, time: formatActivityClock(step.atMs), title: stepTitle(step), detail: stepDetail(step), tone: stepTone(step) })),
    truncatedNote: story.truncated ? `Showing the first ${story.steps.length} steps of a longer run.` : '',
  };
}

/**
 * Reads the ordered steps of one run.
 *
 * @param source The Activity port.
 * @param correlationId The run.
 * @returns The ready read; rejects when the read fails.
 */
export function readActivityRunStory(source: ActivitySource, correlationId: string): Promise<ActivityRunStoryRead> {
  return source.getRunStory(correlationId).then((value) => ({ status: 'ready', value }));
}
