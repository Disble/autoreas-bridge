import calendarIcon from '@iconify-icons/solar/calendar-bold';
import calendarMarkIcon from '@iconify-icons/solar/calendar-mark-bold';
import checkCircleIcon from '@iconify-icons/solar/check-circle-bold';
import clockIcon from '@iconify-icons/solar/clock-circle-bold';
import closeCircleIcon from '@iconify-icons/solar/close-circle-bold';
import dangerCircleIcon from '@iconify-icons/solar/danger-circle-bold';
import downloadIcon from '@iconify-icons/solar/download-minimalistic-bold';
import historyIcon from '@iconify-icons/solar/history-bold';
import pauseCircleIcon from '@iconify-icons/solar/pause-circle-bold';
import halfIcon from '@iconify-icons/solar/pie-chart-2-bold';
import playCircleIcon from '@iconify-icons/solar/play-circle-bold';
import plugCircleIcon from '@iconify-icons/solar/plug-circle-bold';
import questionCircleIcon from '@iconify-icons/solar/question-circle-bold';
import refreshIcon from '@iconify-icons/solar/refresh-bold';
import stopCircleIcon from '@iconify-icons/solar/stop-circle-bold';
import type { IconifyIcon } from '@iconify/react';
import type { RunHistoryPresentation, RunHistoryStoryState, RunHistoryTone } from './run-history-panel.types';

/** Milliseconds in one day, for the Today/Yesterday labels. */
export const RUN_HISTORY_DAY_MS = 86_400_000;

/** Initial batch size for the run-history master list. */
export const RUN_HISTORY_PAGE_SIZE = 20;

/** The detail pane's awaiting-selection copy. */
export const RUN_HISTORY_DETAIL_AWAITING = {
  title: 'No run selected',
  description: 'Pick a run to see its counters and links.',
} as const;

/** Every trigger the backend writes; an unknown one shows its raw value with the fallback icon. */
export const RUN_HISTORY_TRIGGERS: Readonly<Record<string, { readonly label: string; readonly icon: IconifyIcon }>> = {
  scheduled: { label: 'Scheduled', icon: clockIcon },
  manual: { label: 'Manual check', icon: playCircleIcon },
  manual_anime: { label: 'Anime catch-up', icon: downloadIcon },
  'season-availability': { label: 'Season check', icon: calendarIcon },
  missed_startup: { label: 'Missed day', icon: historyIcon },
  notification_action: { label: 'Rerun from notification', icon: refreshIcon },
};

/** The icon of a trigger the map does not know. */
export const RUN_HISTORY_UNKNOWN_TRIGGER_ICON = historyIcon;

/** Terminal statuses, `running` and startup's `interrupted`; `ok` shows no status icon. */
export const RUN_HISTORY_STATUSES: Readonly<Record<string, RunHistoryPresentation | null>> = {
  ok: null,
  running: { label: 'Running', icon: refreshIcon, tone: 'accent' },
  partial: { label: 'Partial', icon: halfIcon, tone: 'warning' },
  error: { label: 'Error', icon: closeCircleIcon, tone: 'danger' },
  jd_offline: { label: 'JDownloader offline', icon: plugCircleIcon, tone: 'warning' },
  no_animes_today: { label: 'No anime today', icon: calendarMarkIcon, tone: 'default' },
  canceled: { label: 'Canceled', icon: stopCircleIcon, tone: 'default' },
  interrupted: { label: 'Interrupted', icon: pauseCircleIcon, tone: 'warning' },
};

/** The icon of a status the map does not know. */
export const RUN_HISTORY_UNKNOWN_STATUS_ICON = questionCircleIcon;

/** Statuses the Problems filter keeps. */
export const RUN_HISTORY_PROBLEM_STATUSES: ReadonlySet<string> = new Set(['partial', 'error', 'jd_offline', 'interrupted']);

/** Fixed labels for the `failureKind` values the pipeline writes. */
export const RUN_HISTORY_FAILURE_LABELS: Readonly<Record<string, string>> = {
  configuration: 'Configuration',
  captcha: 'Captcha',
  hoster_down: 'Hoster down',
  slow_or_timeout: 'Slow or timeout',
};

/** Fixed labels for the skip reasons the pipeline writes. */
export const RUN_HISTORY_SKIP_LABELS: Readonly<Record<string, string>> = {
  missing_pagina: 'Missing page',
  missing_carpeta: 'Missing folder',
  unsupported_tipo: 'Unsupported type',
};

/** The outcome groups of the detail, in display order. */
export const RUN_HISTORY_GROUPS = {
  failed: { label: 'Failed', icon: closeCircleIcon, tone: 'danger' },
  notAttempted: { label: 'Not attempted', icon: pauseCircleIcon, tone: 'default' },
  downloading: { label: 'Downloading', icon: refreshIcon, tone: 'accent' },
  downloaded: { label: 'Downloaded', icon: downloadIcon, tone: 'success' },
  skipped: { label: 'Skipped', icon: dangerCircleIcon, tone: 'warning' },
  upToDate: { label: 'Up to date', icon: checkCircleIcon, tone: 'default' },
} as const satisfies Record<string, RunHistoryPresentation>;

/** The slow turn of a live run's icon, held still when the user prefers reduced motion. */
export const RUN_HISTORY_SPIN_CLASS = 'animate-spin motion-reduce:animate-none [animation-duration:1.6s]';

/** Text color per tone, applied to icons and bar segments only. */
export const RUN_HISTORY_TONE_ICON_CLASS: Readonly<Record<RunHistoryTone, string>> = {
  default: 'text-muted',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/** The tooltip beside the totals of a run whose events are past the retention. */
export const RUN_HISTORY_EXPIRED_NOTE = 'Per-anime detail is kept for 90 days';

/** The row empty state of a finished run group whose episodes the story never recorded per anime. */
export const RUN_HISTORY_UNRECORDED_COPY = {
  title: 'Episodes not recorded',
  description: 'This run kept no per-anime record of these episodes.',
} as const;

/** Accessible name of the skeleton shown while the catalog names an anime. */
export const RUN_HISTORY_NAME_LOADING_LABEL = 'Loading anime name';

/** Accessible name of the no-cover poster. */
export const RUN_HISTORY_NO_COVER_LABEL = 'No cover';

/** Copy confirmations. */
export const RUN_HISTORY_COPY_CONFIRMATIONS = {
  runId: 'Run id copied',
  link: 'Link copied',
  allLinks: 'All links copied',
} as const;

/**
 * The Problems filter pill, matching Activity's failure button: 32px tall and
 * fully round, its alert icon before the count, fading over .2s between soft
 * and solid red. While off it is danger at 18% over the card, its text danger
 * mixed 70% into the foreground.
 */
export const RUN_HISTORY_PROBLEMS_CLASSES = {
  pill: 'h-8 flex-none gap-1.5 rounded-full px-3 text-sm font-medium tabular-nums [transition:background-color_.2s,color_.2s] motion-reduce:[transition:none]',
  pillSoft: 'bg-[color-mix(in_oklab,var(--danger)_18%,transparent)] text-[color-mix(in_oklab,var(--danger)_70%,var(--foreground))]',
} as const;

/** The Problems filter's tooltip by state. */
export const RUN_HISTORY_PROBLEMS_TOOLTIP = { off: 'Show only problems', on: 'Show all runs' } as const;

/** The line under the header while a stop is pending. */
export const RUN_HISTORY_STOPPING_NOTE = 'Stopping — the run ends after the episode it is already downloading.';

/** The one "still loading" story state, shared so a re-render does not look like a new story. */
export const RUN_HISTORY_STORY_LOADING: RunHistoryStoryState = { status: 'loading' };

/** The detail pane surface: a step darker than the card it sits on. */
export const RUN_HISTORY_PANE_CLASS = 'flex min-w-0 flex-col gap-[18px] rounded-2xl bg-[color-mix(in_oklab,var(--background)_35%,var(--surface))] p-5';
