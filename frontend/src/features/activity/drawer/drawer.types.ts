import type { ActivityFeedLine } from '../feed-source/feed.types';
import type { ActivityIncidentDetail } from '../activity-source/activity-incident.types';

/**
 * View models of the Activity detail drawer (activity-ui-design-v2.md, Detail
 * drawer, Technical view, Event presentation model). Every string in them comes
 * from a stored field or from a closed vocabulary the code defines.
 */

/** One label and value row of a facts section. */
export interface DrawerFact {
  /** Stable key within its section. */
  readonly key: string;
  /** The label, a stored key for the generic layer. */
  readonly label: string;
  /** The value as stored or formatted from a stored field. */
  readonly value: string;
  /** Whether label and value are monospace (stored keys and raw values). */
  readonly mono: boolean;
  /** An amber chip after the value, such as `6 h 31 min late`; undefined when none. */
  readonly warnChip: string | undefined;
}

/** One figure of a stats section. */
export interface DrawerStat {
  /** Stable key. */
  readonly key: string;
  /** The figure. */
  readonly value: string;
  /** What it counts. */
  readonly label: string;
  /** Whether the figure counts failures and is not zero. */
  readonly failed: boolean;
}

/** One timed row of a list section. */
export interface DrawerListItem {
  /** Stable key. */
  readonly key: string;
  /** Clock time. */
  readonly time: string;
  /** What happened, from stored fields. */
  readonly text: string;
  /** Whether the row failed. */
  readonly failed: boolean;
}

/** The layer-2 cause of a failure: a catalog sentence or the recorded message, with its code. */
export interface DrawerCause {
  /** The catalog sentence with its placeholders filled; undefined when the code has no entry. */
  readonly sentence: string | undefined;
  /** The recorded message, shown as is when there is no sentence. */
  readonly recordedMessage: string;
  /** The code chip: the error code, else `HTTP <status>`, else empty. */
  readonly code: string;
}

/** One section of the summary view. */
export type DrawerSection =
  | { readonly kind: 'before-after'; readonly key: string; readonly title: string; readonly before: string; readonly after: string }
  | { readonly kind: 'facts'; readonly key: string; readonly title: string; readonly rows: readonly DrawerFact[] }
  | { readonly kind: 'stats'; readonly key: string; readonly items: readonly DrawerStat[] }
  | { readonly kind: 'cause'; readonly key: string; readonly title: string; readonly cause: DrawerCause }
  | { readonly kind: 'list'; readonly key: string; readonly title: string; readonly items: readonly DrawerListItem[] }
  | { readonly kind: 'run-story'; readonly key: string; readonly correlationId: string }
  | { readonly kind: 'code'; readonly key: string; readonly title: string; readonly text: string }
  | { readonly kind: 'note'; readonly key: string; readonly text: string };

/** The drawer header shared by every kind. */
export interface DrawerHeaderModel {
  /** Where it happened. */
  readonly origin: ActivityFeedLine['origin'];
  /** Accessible name of the origin icon. */
  readonly originLabel: string;
  /** Anime or subject. */
  readonly title: string;
  /** The row's phrase; empty when the line has none. */
  readonly phrase: string;
  /** Whether the line failed (red phrase and icon tile). */
  readonly failed: boolean;
  /** Whether the line was slow (amber icon tile). */
  readonly slow: boolean;
  /** The icon tile tone: failed wins over slow. */
  readonly tone: 'failed' | 'slow' | 'neutral';
  /** Full date and time. */
  readonly when: string;
}

/** The summary view of one line. */
export interface DrawerSummaryModel {
  /** Its sections, top to bottom. */
  readonly sections: readonly DrawerSection[];
  /** What the summary could not translate, said once above the technical tabs. */
  readonly gaps: readonly string[];
}

/** What the summary is built from: the line and the reads the drawer made for it. */
export interface DrawerSummaryInput {
  /** The open line. */
  readonly line: ActivityFeedLine;
  /** Its incident occurrence; undefined when it has none or it is no longer stored. */
  readonly incident: ActivityIncidentDetail | undefined;
  /** The event's recorded metadata, keys as stored; undefined when it could not be read. */
  readonly metadata: Readonly<Record<string, string>> | undefined;
  /** The current time, epoch milliseconds. */
  readonly nowMs: number;
}

/** One tab of the technical view. */
export type DrawerTechnicalTab = 'requests' | 'events' | 'data';

/** One route-and-status group of the Requests tab. */
export interface DrawerRequestGroup {
  /** Stable key. */
  readonly key: string;
  /** Route template. */
  readonly route: string;
  /** Status chip words: the HTTP status, or `no answer`. */
  readonly status: string;
  /** Whether the status is 4xx or 5xx. */
  readonly failed: boolean;
  /** Requests folded into the group. */
  readonly count: number;
  /** Clock time of the latest. */
  readonly latestTime: string;
  /** Id of the latest request, the one the panel shows. */
  readonly latestRequestId: string;
}

/** One runtime event of the Events tab. */
export interface DrawerEventRow {
  /** Stable key. */
  readonly key: string;
  /** Time to the second. */
  readonly time: string;
  /** Level chip words. */
  readonly level: string;
  /** Recorded message. */
  readonly message: string;
  /** Domain. */
  readonly domain: string;
  /** Detail line: the event type. */
  readonly detail: string;
}

/** One raw JSON block of the Data tab. */
export interface DrawerDataBlock {
  /** Block title. */
  readonly label: string;
  /** Raw JSON text; empty when nothing was stored. */
  readonly raw: string;
}

/** The picked request panel of the Requests tab. */
export interface DrawerRequestPanel {
  /** The summary line: route, duration and "latest of N · time" when N > 1. */
  readonly summary: readonly string[];
  /** Status chip words. */
  readonly status: string;
  /** Whether the status is 4xx or 5xx. */
  readonly failed: boolean;
  /** Whether the response body holds an `applied_operations` entry with `applied: false`. */
  readonly notApplied: boolean;
  /** Request body text; empty when none was captured. */
  readonly requestBody: string;
  /** Whether the request body was cut at the capture limit. */
  readonly requestCut: boolean;
  /** Response body text; empty when none was captured. */
  readonly responseBody: string;
  /** Whether the response body was cut at the capture limit. */
  readonly responseCut: boolean;
}
