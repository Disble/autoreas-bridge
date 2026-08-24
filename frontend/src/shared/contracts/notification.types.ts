/**
 * NotificationLevel mirrors `internal/notification.Level` (info/success/
 * warning/error). Used to map an incoming notification to the matching
 * HeroUI toast variant.
 */
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

/**
 * DetailItem mirrors `internal/notification.DetailItem` (design.md
 * Task-Planning Note B): one producer-attached thing a notification
 * concerns, e.g. one anime a download run touched. `refType`/`refId` are
 * free-form strings a producer defines — never a feature-specific type.
 * `collapsedCount`, when greater than zero, marks this item as a summary
 * standing in for that many uneventful items instead of naming one
 * individually.
 */
export interface DetailItem {
  readonly RefType: string;
  readonly RefID: string;
  readonly Name: string;
  readonly Status: string;
  readonly Detail: string;
  readonly CollapsedCount: number;
}

/**
 * ActionSpec mirrors `internal/notification.ActionSpec`: one producer-
 * attached action a user can take on a notification. `Intent` is a
 * free-form token a registered handler resolves at press time.
 */
export interface ActionSpec {
  readonly Label: string;
  readonly Intent: string;
  readonly Args: Readonly<Record<string, string>>;
}

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
 *
 * `Rows`/`Actions` are OPTIONAL for the same reason: the Go struct always
 * carries the fields (so the wire payload always includes them, `null` when
 * unset), but only a producer that actually attaches something populates
 * them — every other notification arrives with both absent/empty. Neither
 * is consumed by the toast pipeline yet; a producer's rows are read back
 * through the notification-center bindings (`notification-center.types.ts`)
 * once a toast is opened as a Center record.
 */
export interface Notification {
  readonly Title: string;
  readonly Body: string;
  readonly Level: NotificationLevel;
  readonly Source: string;
  /**
   * `Kind` names the specific event this notification is, WITHIN its
   * `Source`: the source is the bounded context that raised it
   * (`download`), the kind is what happened there
   * (`download.run_stopped_early`). Optional because the Go struct treats
   * an empty kind as valid — a producer that has not adopted the vocabulary
   * yet arrives with `''`, which a consumer must read as absent.
   */
  readonly Kind?: string;
  readonly CorrelationID: string;
  readonly Timestamp: string;
  readonly RecordID?: number;
  readonly Rows?: readonly DetailItem[];
  readonly Actions?: readonly ActionSpec[];
}
