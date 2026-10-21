import { getAnimeEstadoLabel } from '../../../shared/helpers/anime-estado.helpers';
import { ACTIVITY_CHANGE_ACTION_WORDS, ACTIVITY_CHANGE_SOURCE_WORDS } from './change-words.constants';
import type { ActivityChangeWordsInput } from './change-words.types';

/**
 * Reads a stored snapshot. Unreadable JSON and `null` read as empty; any other
 * non-object value is boxed, so reading a field from it yields undefined.
 */
function readSnapshot(json: string): Readonly<Record<string, unknown>> {
  try {
    return Object(JSON.parse(json)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Words a before → after pair of one numeric snapshot field, or undefined when either side is missing. */
function describeFieldChange(change: ActivityChangeWordsInput, field: string, format: (value: number) => string): string | undefined {
  const before = readSnapshot(change.beforeJson)[field];
  const after = readSnapshot(change.afterJson)[field];
  if (typeof before !== 'number' || typeof after !== 'number') {
    return undefined;
  }
  return `${format(before)} → ${format(after)}`;
}

/** Words a season grade change; a first grade has no before grade and reads as the grade alone. */
function describeGradeChange(change: ActivityChangeWordsInput): string | undefined {
  const grades = describeFieldChange(change, 'grade', String);
  if (grades !== undefined) {
    return `grade ${grades}`;
  }
  const first = readSnapshot(change.afterJson).grade;
  return typeof first === 'number' ? `grade ${first}` : undefined;
}

/** Words what a write did. */
function describeAction(change: ActivityChangeWordsInput): string {
  if (change.actionType === 'episode_adjusted') {
    const episodes = describeFieldChange(change, 'NroCapVisto', String);
    if (episodes !== undefined) {
      return `episode ${episodes}`;
    }
  }
  if (change.actionType === 'anime_state_set') {
    const states = describeFieldChange(change, 'Estado', getAnimeEstadoLabel);
    if (states !== undefined) {
      return `state ${states}`;
    }
  }
  if (change.actionType === 'season_grade_set') {
    const grade = describeGradeChange(change);
    if (grade !== undefined) {
      return grade;
    }
  }
  return ACTIVITY_CHANGE_ACTION_WORDS[change.actionType] ?? change.actionType.replaceAll('_', ' ');
}

/**
 * Words one write-journal row in plain words, the single wording every Activity
 * surface uses for a change (docs/design/patterns/activity-change-lines.md).
 *
 * @param change The write.
 * @returns `episode 10 → 11 · from the phone`.
 */
export function describeActivityChange(change: ActivityChangeWordsInput): string {
  const writer = ACTIVITY_CHANGE_SOURCE_WORDS[change.source] ?? `from ${change.source}`;
  return `${describeAction(change)} · ${writer}`;
}
