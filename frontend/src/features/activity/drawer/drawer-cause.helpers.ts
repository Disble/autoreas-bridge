import type { ActivityIncidentDetail } from '../activity-source/activity-incident.types';
import { DRAWER_CAUSE_CATALOG } from './drawer.constants';
import type { DrawerCause } from './drawer.types';

/**
 * Fills `{name}` placeholders from recorded fields. A placeholder whose field
 * is missing stays visible as `{name}`; a value is never guessed.
 *
 * @param template The catalog sentence.
 * @param fields The recorded fields.
 * @returns The filled sentence.
 */
export function fillDrawerCauseSentence(template: string, fields: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => fields[name] ?? placeholder);
}

/** The HTTP status of the request that triggered the incident, when one did. */
function triggerStatus(detail: ActivityIncidentDetail): number | undefined {
  return detail.requests.find((request) => request.containsTrigger)?.httpStatus;
}

/**
 * Words the recorded cause of an incident through the cause catalog: a
 * catalogued code reads its sentence, any other shows the recorded message as
 * is. The code chip is the error code, else the triggering HTTP status.
 *
 * @param detail The incident occurrence.
 * @returns The cause; undefined when the fact recorded none.
 */
export function toDrawerCause(detail: ActivityIncidentDetail): DrawerCause | undefined {
  if (!detail.cause.known) {
    return undefined;
  }
  const { errorCode, message } = detail.cause;
  const template = DRAWER_CAUSE_CATALOG[errorCode];
  const status = triggerStatus(detail);
  const code = errorCode !== '' ? errorCode : status === undefined ? '' : `HTTP ${status}`;
  return { sentence: template === undefined ? undefined : fillDrawerCauseSentence(template, { code: errorCode }), recordedMessage: message, code };
}

/**
 * What the technical view notes about a cause the summary could not translate.
 *
 * @param detail The incident occurrence.
 * @returns The note, or undefined when the cause was translated or recorded none.
 */
export function toDrawerCauseGap(detail: ActivityIncidentDetail): string | undefined {
  const cause = toDrawerCause(detail);
  if (cause === undefined || cause.sentence !== undefined) {
    return undefined;
  }
  if (detail.cause.errorCode !== '') {
    return `No catalog entry for \`${detail.cause.errorCode}\`. The recorded message is shown as is.`;
  }
  const status = triggerStatus(detail);
  return status === undefined ? undefined : `The ${status} carried no error code, only a message. It is shown as recorded.`;
}
