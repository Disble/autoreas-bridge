/**
 * Frontend mirror of `internal/api/contracts/notification_center.go`'s DTOs
 * (design.md §10), following `capture.types.ts`'s shape. Field names follow
 * the Go structs' JSON tags (camelCase); every property is `readonly`.
 */

/** ListNotifications query DTO: a keyset page request plus the view/read filters. */
export interface NotificationListRequest {
  readonly view: string; // "active" | "archived"
  readonly unreadOnly: boolean;
  readonly search: string;
  readonly sources: readonly string[];
  readonly levels: readonly string[];
  readonly cursor: string;
  readonly limit: number;
}

/**
 * One list/detail-embedded notification row.
 *
 * `kind` names the specific event (`download.run_stopped_early`), where
 * `source` names the bounded context that raised it (`download`). It is
 * optional because records written before the column existed carry none, and
 * an absent kind must render as absent rather than as an empty labelled row.
 *
 * `rowCount` and `subjects` are what let the master list say WHICH things a
 * notification is about instead of only how many -- the argument the
 * `Anatomy.dc.html` artboard opens with. `subjects` is deliberately a bounded
 * excerpt of the detail rows' names, not the whole list: a run can touch fifty
 * anime, and a list row that carries all of them is a log entry.
 */
export interface NotificationRow {
  readonly id: number;
  readonly createdAtMs: number;
  readonly title: string;
  readonly body: string;
  readonly level: string;
  readonly source: string;
  readonly kind?: string;
  readonly correlationId?: string;
  readonly readAtMs?: number;
  readonly archivedAtMs?: number;
  readonly actionCount: number;
  readonly rowCount?: number;
  readonly subjects?: readonly string[];
}

/**
 * One `ListNotifications` keyset page. `totalEver` counts every record ever
 * recorded, independent of the current view/filter -- it is what
 * distinguishes "nothing has ever been recorded" from "records exist but
 * none match the current filter" (design §9.3). `degraded` is true when the
 * store is unavailable or the query failed; `items` is then an empty array.
 */
export interface NotificationPage {
  readonly items: readonly NotificationRow[];
  readonly nextCursor?: string;
  readonly appliedLimit: number;
  readonly totalEver: number;
  readonly degraded: boolean;
}

/** One row of a notification's single bounded row-list detail block. */
export interface NotificationDetailRow {
  readonly refType: string;
  readonly refId: string;
  readonly name: string;
  readonly status: string;
  readonly detail: string;
  readonly actionIds?: readonly string[];
  readonly collapsedCount?: number;
}

/**
 * One persisted PendingIntent token, as exposed on the wire. Frozen args are
 * deliberately NOT included: the frontend presses a token by id and never
 * sees, and therefore can never propose, the arguments.
 */
export interface NotificationAction {
  readonly id: string;
  readonly rowRef?: string;
  readonly label: string;
  readonly intent: string;
  readonly executedAtMs?: number;
  readonly refusedReason?: string;
}

/** The single-record detail read: the list row fields plus its rows/actions. */
export interface NotificationDetail extends NotificationRow {
  readonly rows: readonly NotificationDetailRow[];
  readonly actions: readonly NotificationAction[];
}

/** `GetNotification` result envelope. */
export interface NotificationDetailResult {
  readonly found: boolean;
  readonly item: NotificationDetail;
  readonly degraded: boolean;
}

/**
 * Result envelope for the lifecycle mutations (`MarkNotificationsRead`,
 * `ArchiveNotifications`, `RestoreNotifications`): how many records were
 * actually affected, and the fresh unread count so the rail badge can update
 * without a second round trip.
 */
export interface NotificationMutationResult {
  readonly affected: number;
  readonly unreadCount: number;
  readonly degraded: boolean;
}

/**
 * The `ExecuteNotificationAction` result envelope (design.md §5.7's
 * `ExecuteResult`, mapped onto the wire). `reason` is absent on success;
 * otherwise one of the four closed refusal reasons. Deliberately carries no
 * `degraded` flag: an executor that is not wired yet degrades to the same
 * `intent_unregistered` refusal an empty `IntentRegistry` already produces
 * -- a refusal is always a first-class, closed-set outcome, never an
 * out-of-band signal.
 */
export interface NotificationActionResult {
  readonly executed: boolean;
  readonly reason?: string;
  readonly message?: string;
  readonly executedAtMs?: number;
}
