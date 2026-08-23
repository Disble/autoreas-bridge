/**
 * Frontend mirror of `internal/api/contracts/notification_center.go`'s DTOs
 * (design.md §10), following `capture.types.ts`'s shape. Field names follow
 * the Go structs' JSON tags (camelCase); every property is `readonly`.
 * `NotificationActionResult` is deferred to Slice 5, where the PendingIntent
 * action-execution binding lands.
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
 * One list/detail-embedded notification row. `actionCount` is always 0 on
 * `ListNotifications` rows (the store's list query does not load per-row
 * actions) and the real count on `GetNotification`'s detail row.
 */
export interface NotificationRow {
  readonly id: number;
  readonly createdAtMs: number;
  readonly title: string;
  readonly body: string;
  readonly level: string;
  readonly source: string;
  readonly correlationId?: string;
  readonly readAtMs?: number;
  readonly archivedAtMs?: number;
  readonly actionCount: number;
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
