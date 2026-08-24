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
 *
 * `RecordID` is forward-compatible and OPTIONAL: as of Slice 4-i,
 * `internal/notification.Notification` (the Go struct actually serialized
 * onto this event, `internal/notification/notifier.go`) carries no such
 * field, so it always arrives `undefined` today. Reading it here now (rather
 * than dropping it, Bug A) lets `use-backend-event-resolver.ts` forward a
 * real persisted record id the moment a later slice's producer wiring
 * starts sending one, without another frontend contract change.
 */
export interface Notification {
  readonly Title: string;
  readonly Body: string;
  readonly Level: NotificationLevel;
  readonly Source: string;
  readonly CorrelationID: string;
  readonly Timestamp: string;
  readonly RecordID?: number;
}
