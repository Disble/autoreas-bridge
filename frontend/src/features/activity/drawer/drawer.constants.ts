import type { ActivitySyncReadingKind } from '../feed-source/feed.types';

/**
 * Layer 2 of the event presentation model: one sentence per error code,
 * written once by a person. `{name}` placeholders read fields of the recorded
 * error; a missing field stays visible as `{name}`. A code with no entry shows
 * its recorded message as is. No sentence is approved yet: the design doc marks
 * the `conflict` and `unsupported_operation` wordings as drafts, so every code
 * shows its recorded message.
 */
export const DRAWER_CAUSE_CATALOG: Readonly<Record<string, string>> = {};

/** Plain words of the closed `kind` enum of a window error (`ReportFrontendError`). */
export const DRAWER_WINDOW_ERROR_KIND_WORDS: Readonly<Record<string, string>> = {
  render: 'crashed while drawing',
  error: 'hit a code error',
  unhandledrejection: 'had a background task fail',
};

/** What each reading of a failed sync means, in one sentence the drawer states. */
export const DRAWER_READING_MEANINGS: Readonly<Record<ActivitySyncReadingKind, string>> = {
  bridge_off: 'The phone could not reach Bridge because it was off, and the change arrived when it started.',
  tablet_late: 'Bridge was back, but the report took more than 30 minutes to arrive.',
  real_failure: 'Bridge was on and the sync still failed.',
};

/** The Bridge off meaning of a group of several changes. */
export const DRAWER_BRIDGE_OFF_MEANING_MANY = 'The phone could not reach Bridge because it was off, and the changes arrived when it started.';

/** The labels of a reading's evidence times. */
export const DRAWER_EVIDENCE_LABELS = {
  failed: 'Failed at',
  contact: 'Last contact',
  start: 'Bridge started',
  off: 'Bridge off',
  grace: 'Grace period',
  firstReport: 'First report',
  overdue: 'Overdue by',
  arrived: 'Arrived',
} as const;

/** What an evidence time reads as when that fact does not exist. */
export const DRAWER_EVIDENCE_NOT_RECORDED = 'Not recorded';

/** Title of a Bridge off group's report list, and name of its picker in the technical view. */
export const DRAWER_REPORTS_TITLE = 'Reports';

/** The label of a report as stored: the validated record re-serialized, not mobile's raw bytes. */
export const DRAWER_STORED_REPORT_LABEL = 'Stored report';

/** Accessible names of the origin icon. */
export const DRAWER_ORIGIN_LABELS = { phone: 'From the phone', bridge: 'In the bridge' } as const;

/** Snapshot fields a change presenter shows as before → after, per action type. */
export const DRAWER_CHANGE_FIELDS: Readonly<Record<string, { readonly field: string; readonly title: string }>> = {
  episode_adjusted: { field: 'NroCapVisto', title: 'Episode' },
  anime_state_set: { field: 'Estado', title: 'State' },
  season_grade_set: { field: 'grade', title: 'Grade' },
};

/** The event type of a window error. */
export const DRAWER_WINDOW_ERROR_EVENT_TYPE = 'frontend.error';

/** Domains whose events are scheduled tasks. */
export const DRAWER_TASK_DOMAINS: ReadonlySet<string> = new Set(['schedule', 'season']);

/** Full requests live this long in the Recorder (activity-ui-design-v2.md, Technical view). */
export const DRAWER_RECORDER_RETENTION_MS = 2 * 60 * 60 * 1000;

/** One hour, epoch milliseconds. */
export const DRAWER_HOUR_MS = 60 * 60 * 1000;

/** One minute, epoch milliseconds. */
export const DRAWER_MINUTE_MS = 60 * 1000;

/** The empty Requests tab. */
export const DRAWER_REQUESTS_EMPTY_TITLE = 'Full requests are kept for 2 hours';

/** Why an old, fine line has no requests. */
export const DRAWER_REQUESTS_EMPTY_FINE = 'This hour went fine, so only its totals are left. Failed requests are kept longer.';

/** Why a failed line has no requests: no incident pinned any. */
export const DRAWER_REQUESTS_EMPTY_UNPINNED = 'No request was pinned to this event.';

/** The note of an older traffic hour that did not fail. */
export const DRAWER_TOTALS_ONLY_NOTE = 'Single check-ins are kept for 2 hours. Older hours keep only these totals.';

/** The title of what one device reported for a traffic hour in its hourly summary (S6 P1). */
export const DRAWER_TABLET_TITLE = 'What the tablet reported';

/** The title of one device's process deaths of a traffic hour. */
export const DRAWER_PROCESS_DEATHS_TITLE = 'Process deaths';

/** Loading label of the drawer body. */
export const DRAWER_LOADING_LABEL = 'Loading the event detail';

/** Failure title of the drawer body. */
export const DRAWER_ERROR_TITLE = 'The event detail could not be read';

/** Full date and time of the drawer header: `Thu, Oct 22 · 14:35`. */
export const DRAWER_WHEN_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** Short date of "kept until": `Jan 20`. */
export const DRAWER_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** What the summary says for a run or task whose stored events are none. */
export const DRAWER_NO_RUN_EVENTS_NOTE = 'No events were recorded for this run.';

/** What the Events tab says for a line no stored runtime event is linked to (L18 E1). */
export const DRAWER_NO_LINE_EVENTS_NOTE = 'No runtime events are linked to this line.';

/** The Events tab note of a change line whose linked events could not be read. */
export const DRAWER_CHANGE_READ_FAILED_NOTE = 'The events linked to this change could not be read.';

/** The drawer before any line was opened. */
export const DRAWER_PRESENCE_CLOSED = { line: undefined, open: false, session: 0 } as const;

/**
 * Stored stacks at or above this many UTF-8 bytes were cut: the report keeps 8 KiB
 * (`frontendErrorStackLimit`) and a rune split drops up to 3 bytes; nothing else records a cut.
 */
export const DRAWER_STACK_CUT_BYTES = 8192 - 3;

/** The four stages of a native sync cycle in order (S4), each as stored and in plain words. */
export const DRAWER_CYCLE_STAGES: readonly { readonly stage: string; readonly label: string }[] = [
  { stage: 'attempt_started', label: 'Attempt started' },
  { stage: 'claim_ops', label: 'Claiming changes' },
  { stage: 'http', label: 'Sending' },
  { stage: 'apply_write', label: 'Applying' },
];

/** The notes of a failed cycle's stages: where it stopped and the stages after it. */
export const DRAWER_STEP_NOTES = { stopped: 'Stopped here', notReached: 'Not reached' } as const;

/** The label of a runtime transition's recorded reason. */
export const DRAWER_REASON_LABEL = 'Recorded reason';
