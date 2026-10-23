import type { ReactNode, RefObject, UIEvent } from 'react';
import type { Key } from '@heroui/react';
import type { ActivityRequestDetail, ActivityWhere } from '../../activity-source/activity-incident.types';
import type { ActivityChipModel, ActivityRead, ActivityTone } from '../ActivityRunStory/activity-run-story.types';

/** What the detail pane shows: one incident occurrence or one run. */
export type ActivityIncidentSelection =
  | { readonly kind: 'incident'; readonly id: number }
  | { readonly kind: 'run'; readonly correlationId: string };

/** One row of the left list: an incident or, for an internal filter, a run. */
export interface ActivityIncidentListEntry {
  /** Stable React key, unique across both kinds. */
  readonly key: string;
  /** What pressing the row opens. */
  readonly selection: ActivityIncidentSelection;
  /** The section title this row starts; empty when it continues a section. */
  readonly heading: string;
  /** Plain-words title. */
  readonly title: string;
  /** When it happened and how often, `Oct 17, 17:31 · 5 times`. */
  readonly meta: string;
  /** The dot's tone: errors danger, slow calls and recovered runs warning. */
  readonly tone: ActivityTone;
  /** Whether the "New" chip shows. */
  readonly isNew: boolean;
  /** A run's outcome chip, only when it needs attention. */
  readonly chip: ActivityChipModel | undefined;
}

/** One marker on a window lane. */
export interface ActivityLaneMarker {
  /** Stable React key. */
  readonly key: string;
  /** Position across the window, 0-100. */
  readonly leftPercent: number;
  /** Failures danger, warnings warning, the rest quiet. */
  readonly tone: ActivityTone;
  /** Whether this marker is the fact that opened the incident. */
  readonly isTrigger: boolean;
  /** Hover text. */
  readonly title: string;
}

/** One lane of the window: phone reports, requests or bridge events. */
export interface ActivityLane {
  /** Lane label. */
  readonly label: string;
  /** Its markers, oldest first. */
  readonly markers: readonly ActivityLaneMarker[];
}

/** The pinned window drawn as three lanes on one time axis. */
export interface ActivityLanesModel {
  /** Phone, Requests and Bridge, in that order. */
  readonly lanes: readonly ActivityLane[];
  /** Where the incident moment sits across the window, 0-100. */
  readonly occurredPercent: number;
  /** Axis label at the window start, `−2 min`. */
  readonly startLabel: string;
  /** Axis label at the window end, `+30 s`. */
  readonly endLabel: string;
  /** Text alternative of the lanes image. */
  readonly summary: string;
}

/** One row of "Requests in this window". */
export interface ActivityRequestRowModel {
  /** The row's latest request id: React key and the id its detail reads. */
  readonly requestId: string;
  /** Local time of the row's latest request. */
  readonly time: string;
  /** Route template. */
  readonly route: string;
  /** `×5` when requests were folded; empty for one. */
  readonly countLabel: string;
  /** HTTP status, or a dash when unanswered. */
  readonly status: string;
  /** Status color: 5xx danger, 4xx warning. */
  readonly statusTone: ActivityTone;
  /** Slowest duration, or a dash. */
  readonly duration: string;
  /** Whether the triggering request is folded into this row. */
  readonly isTrigger: boolean;
}

/** The recorded cause, worded for the danger alert. */
export interface ActivityCauseModel {
  /** The stored error code; empty when none. */
  readonly code: string;
  /** The stored error text. */
  readonly message: string;
}

/** One incident occurrence worded for the detail pane. */
export interface ActivityIncidentDetailModel {
  /** Plain-words title. */
  readonly title: string;
  /** The window span, `Oct 17, 17:29 → 17:31`. */
  readonly span: string;
  /** Context chips: what fired it and the trigger reason. */
  readonly chips: readonly ActivityChipModel[];
  /** The recorded cause; undefined when none is recorded. */
  readonly cause: ActivityCauseModel | undefined;
  /** The window lanes. */
  readonly lanes: ActivityLanesModel;
  /** "Requests in this window", polling folded. */
  readonly requests: readonly ActivityRequestRowModel[];
  /** Earlier occurrences in words. */
  readonly earlierLine: string;
  /** When this occurrence ages out, in words. */
  readonly expiryLine: string;
  /** The MCP-ready reference "Copy for AI" copies. */
  readonly copyText: string;
  /** The run an internal incident opens; undefined for a request window. */
  readonly runCorrelationId: string | undefined;
}

/** One body of the selected request: its first lines, the full text on demand. */
export interface ActivityBodyModel {
  /** `Response body` or `Request body`. */
  readonly label: string;
  /** Whether text was stored. */
  readonly state: 'captured' | 'not-captured';
  /** Why no text shows, for a body that was not stored. */
  readonly notice: string;
  /** The first lines, without parsing. */
  readonly preview: string;
  /** Whether the preview already holds the whole body. */
  readonly isComplete: boolean;
  /** The whole stored text. */
  readonly raw: string;
  /** A note about what was stored, such as truncation; empty when none. */
  readonly note: string;
}

/** The selected request worded for its pane. */
export interface ActivityRequestDetailModel {
  /** `17:31:04.120 · /api/sync/reconcile · 500 · 41 ms · Pixel`. */
  readonly summary: string;
  /** The response body, then the request body. */
  readonly bodies: readonly ActivityBodyModel[];
}

/** The selected request's read, keyed by its id. */
export type ActivityRequestRead = ActivityRead<ActivityRequestDetail>;

/** A request the owner picked, remembered with the incident it was picked in. */
export interface ActivityPickedRequest {
  /** The incident shown when the request was picked. */
  readonly incidentId: number;
  /** The picked request. */
  readonly requestId: string;
}

/** Props of the left list. */
export interface ActivityIncidentListProps {
  /** The rows in progressive order. */
  readonly entries: readonly ActivityIncidentListEntry[];
  /** How many rows the progressive window renders. */
  readonly visibleCount: number;
  /** The selected row's key; empty when none. */
  readonly selectedKey: string;
  /** The scroll container the window grows from. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** Grows the window near the bottom. */
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
  /** Opens one row. */
  readonly onSelect: (selection: ActivityIncidentSelection) => void;
}
