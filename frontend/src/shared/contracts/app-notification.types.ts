/** Severity levels consumed by the toast controller to select the HeroUI variant. */
export type AppNotificationSeverity = 'info' | 'success' | 'warning' | 'error';

/** Button action rendered inside an actionable toast. */
export interface AppNotificationAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
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
  readonly persistent?: boolean;
  readonly dedupeKey?: string;
  readonly recordId?: number;
  readonly source?: string;
  readonly correlationId?: string;
  readonly timestamp?: string;
}
