/** Severity levels consumed by the toast controller to select the HeroUI variant. */
export type AppNotificationSeverity = 'info' | 'success' | 'warning' | 'error';

/** Button action rendered inside an actionable toast. */
export interface AppNotificationAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
}

/**
 * One thing a toast is about: which anime, what happened to it, and the line
 * that says which episodes.
 *
 * A toast renders these as identity and offers no per-row verb. A surface
 * measured in seconds should not ask the user to choose between row actions;
 * the row says WHICH, and the Center record is one press away for anything
 * finer (docs/notification-cta-policy.md, Table C).
 */
export interface AppNotificationRow {
  readonly refType: string;
  readonly refId: string;
  readonly name: string;
  readonly status: string;
  readonly detail: string;
  readonly collapsedCount?: number;
}

/**
 * A notification envelope produced by any resolver and consumed by the
 * toast controller.
 *
 * Decision E (design.md §3): `persistedId` splits into `dedupeKey` (a
 * client-owned ledger key, e.g. `MISSED_DECISION_TOAST_ID`) and `recordId`
 * (the backend-persisted notification-center record id, when one exists).
 * Bug A fed a backend record id into the single old `persistedId` field,
 * which a "View details" affordance would have tried to open as if it were
 * a client literal -- keeping them separate makes that impossible by
 * construction. `source`/`correlationId`/`timestamp` mirror the backend
 * `Notification` DTO fields a resolver must not silently drop (Bug A).
 */
export interface AppNotification {
  readonly severity: AppNotificationSeverity;
  readonly title: string;
  readonly description?: string;
  readonly actions?: readonly AppNotificationAction[];
  /** What this notification is about, when it names anything. */
  readonly rows?: readonly AppNotificationRow[];
  readonly persistent?: boolean;
  readonly dedupeKey?: string;
  readonly recordId?: number;
  readonly source?: string;
  readonly correlationId?: string;
  readonly timestamp?: string;
}
