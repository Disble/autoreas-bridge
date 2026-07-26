/** Severity levels consumed by the toast controller to select the HeroUI variant. */
export type AppNotificationSeverity = 'info' | 'success' | 'warning' | 'error';

/** Button action rendered inside an actionable toast. */
export interface AppNotificationAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
}

/** A notification envelope produced by any resolver and consumed by the toast controller. */
export interface AppNotification {
  readonly severity: AppNotificationSeverity;
  readonly title: string;
  readonly description?: string;
  readonly actions?: readonly AppNotificationAction[];
  readonly persistent?: boolean;
  readonly persistedId?: string;
}
