/**
 * NotificationLevel mirrors `internal/notification.Level` (info/success/
 * warning/error). Used to map an incoming notification to the matching
 * HeroUI toast variant.
 */
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

/**
 * Notification is the pure DTO carried by the `notification.push` Wails
 * runtime event (mirrors `internal/notification.Notification`). This
 * contract has zero imports and zero behavior — it is the shared shape
 * consumed by `infrastructure/notification-source.ts` and the app-shell
 * toast hook.
 */
export interface Notification {
  readonly Title: string;
  readonly Body: string;
  readonly Level: NotificationLevel;
  readonly Source: string;
  readonly CorrelationID: string;
  readonly Timestamp: string;
}
