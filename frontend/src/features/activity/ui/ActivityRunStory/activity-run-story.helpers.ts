import { ACTIVITY_MCP_SERVER_NAME } from '../../activity-source/activity-source.constants';
import type { ActivityRunStep, ActivityRunStory } from '../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import { ACTIVITY_RUN_FINISHED, ACTIVITY_RUN_OUTCOMES, ACTIVITY_SUCCESS_EVENT_SUFFIXES } from './activity-run-story.constants';
import type {
  ActivityChipModel,
  ActivityChosenStep,
  ActivityMetadataField,
  ActivityMetadataModel,
  ActivityRunStoryModel,
  ActivityRunStoryRead,
  ActivityTone,
} from './activity-run-story.types';
import { formatActivityClock, formatActivityDayTime, formatActivityDuration } from './activity-time.helpers';

/**
 * Words a run's result from its worst level: an error failed it, a warning it
 * recovered from, anything else finished.
 *
 * @param level The worst level of the run.
 * @returns The result chip.
 */
export function describeActivityRunOutcome(level: string): ActivityChipModel {
  return ACTIVITY_RUN_OUTCOMES[level] ?? ACTIVITY_RUN_FINISHED;
}

/**
 * Words a dotted event type, `download.hoster_retry` → `download hoster retry`.
 *
 * @param eventType The stored event type.
 * @returns The type in words.
 */
export function wordActivityEventType(eventType: string): string {
  return eventType.replaceAll(/[._]/g, ' ');
}

/** The run's result from its worst step: any error, else any warning, else finished. */
function runOutcome(steps: readonly ActivityRunStep[]): ActivityChipModel {
  const worst = steps.find((step) => step.level === 'error') ?? steps.find((step) => step.level === 'warn');
  return worst === undefined ? ACTIVITY_RUN_FINISHED : describeActivityRunOutcome(worst.level);
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
 * The MCP-ready reference to one run, for "Copy for AI".
 *
 * @param correlationId The run's correlation id.
 * @param title What ran, in words.
 * @returns The tool call and a one-line context.
 */
export function toActivityRunCopyText(correlationId: string, title: string): string {
  return `Use the ${ACTIVITY_MCP_SERVER_NAME} tool get_run_story with ${JSON.stringify({ correlation_id: correlationId })}.\nRun: ${title}.`;
}

/**
 * Words a run story for the dumb components: the header from its first and
 * last steps and its worst level, and every step in recorded order.
 *
 * @param story The story Go returned.
 * @returns Everything the run story renders.
 */
export function toActivityRunStoryModel(story: ActivityRunStory): ActivityRunStoryModel {
  const first = story.steps.at(0);
  // The last step after the first; a one-step run has none and spans 0 ms.
  // Stryker disable next-line MethodExpression: without slice, at(-1) is the same last step for two or more steps and the first itself for one, so the span is identical.
  const later = story.steps.slice(1).at(-1);
  const title = first === undefined ? `Run ${story.correlationId}` : stepTitle(first);
  return {
    title,
    domain: first?.domain ?? '',
    outcome: runOutcome(story.steps),
    trigger: first?.message ?? '',
    span: first === undefined ? '' : `${formatActivityDayTime(first.atMs)} · took ${formatActivityDuration((later ?? first).atMs - first.atMs)}`,
    steps: story.steps.map((step) => ({ id: step.id, time: formatActivityClock(step.atMs), title: stepTitle(step), detail: stepDetail(step), tone: stepTone(step) })),
    truncatedNote: story.truncated ? `Showing the first ${story.steps.length} steps of a longer run.` : '',
    copyText: toActivityRunCopyText(story.correlationId, title),
  };
}

/**
 * The step the story opens on: the first error, else the first warning, else the first step.
 *
 * @param steps The ordered steps.
 * @returns The step id, or undefined when there are no steps.
 */
export function pickActivityRunStepId(steps: readonly ActivityRunStep[]): number | undefined {
  return (steps.find((step) => step.level === 'error') ?? steps.find((step) => step.level === 'warn') ?? steps.at(0))?.id;
}

/** Whether a parsed value is a plain JSON object. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One value in words: strings as stored, null as a dash, objects as compact JSON. */
function wordValue(value: unknown): string {
  if (value === null) {
    return '—';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** One sequence item, `hoster: mega · ok: false`. */
function wordSequenceItem(item: Readonly<Record<string, unknown>>): string {
  return Object.entries(item)
    .map(([key, value]) => `${key}: ${wordValue(value)}`)
    .join(' · ');
}

/** One labelled field; an array of objects is a sequence, any other array a list. */
function toField(label: string, value: unknown): ActivityMetadataField {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    if (items.length > 0 && items.every(isRecord)) {
      return { kind: 'sequence', label, items: items.map(wordSequenceItem) };
    }
    return { kind: 'value', label, value: items.map(wordValue).join(', ') };
  }
  return { kind: 'value', label, value: wordValue(value) };
}

/**
 * Lays a step's recorded metadata out as labelled fields in recorded order,
 * with the raw JSON (pretty when it parses) behind "Show raw metadata".
 * Unreadable text, including the empty text of a step that recorded nothing,
 * is kept raw with no fields.
 *
 * @param json The step's raw metadata JSON; empty when none was recorded.
 * @returns The fields and the raw text.
 */
export function toActivityRunMetadata(json: string): ActivityMetadataModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { fields: [], raw: json };
  }
  const fields = isRecord(parsed) ? Object.entries(parsed).map(([label, value]) => toField(label, value)) : [];
  return { fields, raw: JSON.stringify(parsed, null, 2) };
}

/**
 * The selected step: the one chosen in this run, else the step the story opens on.
 *
 * @param chosen The last chosen step, with the run it was chosen in.
 * @param correlationId The run shown now.
 * @param steps The run's ordered steps.
 * @returns The selected step id, or undefined when there is none.
 */
export function toActivitySelectedStepId(chosen: ActivityChosenStep | undefined, correlationId: string, steps: readonly ActivityRunStep[]): number | undefined {
  return chosen?.correlationId === correlationId ? chosen.stepId : pickActivityRunStepId(steps);
}

/**
 * Toggles the raw metadata of the selected step.
 *
 * @param openFor The step whose raw metadata is open, if any.
 * @param stepId The selected step.
 * @returns The step left open, or undefined once it closes.
 */
export function toggleActivityRawOpen(openFor: number | undefined, stepId: number | undefined): number | undefined {
  return openFor === stepId ? undefined : stepId;
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
