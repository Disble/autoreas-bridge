import type {
  AppNotification,
  AppNotificationAction,
  AppNotificationRow,
} from '../../../../shared/contracts/app-notification.types';
import type { ActionSpec, DetailItem, Notification } from '../../../../shared/contracts/notification.types';
import { LEVEL_TO_SEVERITY } from './notification-resolver.constants';

/** Presses one persisted token, by the record and action ids that address it. */
export type ExecuteNotificationAction = (recordId: number, actionId: string) => void;

/**
 * Maps one pushed backend notification into the envelope the toast controller renders.
 *
 * This used to be a seven-field projection that dropped `Rows` and `Actions` on the floor, which
 * is why every toast but the missed-schedule one reached the user carrying nothing but a close
 * button (docs/adr/016-notification-adapters-project-not-truncate.md). Both collections were on
 * the wire the whole time.
 */
export function toBackendAppNotification(
  notification: Readonly<Notification>,
  executeAction: ExecuteNotificationAction,
): AppNotification {
  return {
    severity: LEVEL_TO_SEVERITY[notification.Level] ?? 'info',
    title: notification.Title,
    description: notification.Body || undefined,
    persistent: false,
    source: notification.Source,
    correlationId: notification.CorrelationID,
    timestamp: notification.Timestamp,
    recordId: notification.RecordID,
    rows: toToastRows(notification.Rows),
    actions: toToastActions(notification.Actions, notification.RecordID, executeAction),
  };
}

/**
 * Maps the wire's rows into the toast's own row shape, dropping nothing.
 *
 * A row keeps its `collapsedCount` because the summary line is a real row with a real meaning --
 * "6 other anime finished without incident" -- and rebuilding that count downstream would be
 * inventing a number the backend already decided.
 */
function toToastRows(rows: readonly DetailItem[] | undefined): readonly AppNotificationRow[] | undefined {
  if (rows === undefined || rows.length === 0) {
    return undefined;
  }
  return rows.map((row) => ({
    refType: row.RefType,
    refId: row.RefID,
    name: row.Name,
    status: row.Status,
    detail: row.Detail,
    collapsedCount: row.CollapsedCount,
  }));
}

/**
 * Narrows the wire's actions to the ones a toast offers, and binds each to the token it names.
 *
 * Two filters, each closing a different failure. `RowRef` narrows to the whole-notification level:
 * a toast lasts seconds, so it must not ask the user to choose between per-row verbs (Table C).
 * The id and record checks drop anything that addresses no persisted token -- a delivery nothing
 * wrote still reaches the toast, and a button that refuses the moment it is pressed looks, from
 * the user's side, exactly like the missing button it replaced.
 */
function toToastActions(
  actions: readonly ActionSpec[] | undefined,
  recordId: number | undefined,
  executeAction: ExecuteNotificationAction,
): readonly AppNotificationAction[] | undefined {
  if (actions === undefined || recordId === undefined) {
    return undefined;
  }

  const pressable = actions.filter((action) => action.RowRef === '' && action.ID !== '');
  if (pressable.length === 0) {
    return undefined;
  }

  return pressable.map((action) => ({
    label: action.Label,
    onPress: () => executeAction(recordId, action.ID),
  }));
}
