import type { NotificationAction, NotificationDetailRow } from '../../../../shared/contracts/notification-center.types';
import { formatRelativeTimeAgo } from '../../../../shared/datetime/datetime.helpers';
import { formatNotificationWhen } from '../NotificationTable/notification-table.helpers';
import { LEVEL_TO_SEVERITY } from '../NotificationToasts/notification-resolver.constants';
import { REFUSAL_REASON_MESSAGES, SEVERITY_TO_CHIP_COLOR, UNKNOWN_REFUSAL_MESSAGE } from './notification-detail.constants';
import type { NotificationActionUIStatus } from './notification-detail.types';

/**
 * True when a row is the bounded, uneventful cohort collapsed into a single
 * summary line rather than one row per item (notification-center spec,
 * "Uneventful rows collapse into a single summary line").
 */
export function isCollapsedRow(row: Readonly<NotificationDetailRow>): boolean {
  return (row.collapsedCount ?? 0) > 0;
}

/**
 * Resolves one row's own action tokens from the detail's full `actions`
 * list, in `row.actionIds` order. A stale or unknown id (present on the row
 * but absent from `actions`) is dropped rather than rendered as a broken
 * button.
 */
export function resolveRowActions(row: Readonly<NotificationDetailRow>, actions: readonly NotificationAction[]): readonly NotificationAction[] {
  const ids = row.actionIds ?? [];
  const byId = new Map(actions.map((action) => [action.id, action] as const));
  return ids.reduce<NotificationAction[]>((resolved, id) => {
    const action = byId.get(id);
    if (action !== undefined) {
      resolved.push(action);
    }
    return resolved;
  }, []);
}

/**
 * Maps a raw backend `Level` string to the header's/row's chip color,
 * normalizing through `LEVEL_TO_SEVERITY` exactly as
 * `use-backend-event-resolver.ts` does (`?? 'info'` fallback for an
 * unrecognized level).
 */
export function resolveLevelChipColor(level: string): 'accent' | 'danger' | 'success' | 'warning' {
  const severity = LEVEL_TO_SEVERITY[level] ?? 'info';
  return SEVERITY_TO_CHIP_COLOR[severity];
}

/**
 * Capitalizes a raw level string into its chip label ("warning" -> "Warning").
 * An empty string round-trips to itself without a separate branch:
 * `''.charAt(0)` and `''.slice(1)` are both already `''`.
 */
export function formatLevelLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Derives an action's server-known UI status from its persisted fields,
 * before any local optimistic press is layered on top by
 * `useNotificationAction`.
 */
export function resolveServerActionStatus(action: Readonly<NotificationAction>): NotificationActionUIStatus {
  if (action.executedAtMs !== undefined && action.executedAtMs > 0) {
    return 'executed';
  }
  if (action.refusedReason !== undefined && action.refusedReason !== '') {
    return 'refused';
  }
  return 'idle';
}

/** The inline message shown for a refused action (notification-actions spec, "A refused action MUST render its reason inline"). */
export function resolveRefusalMessage(reason: string | undefined): string | undefined {
  if (reason === undefined || reason === '') {
    return undefined;
  }
  return REFUSAL_REASON_MESSAGES[reason] ?? UNKNOWN_REFUSAL_MESSAGE;
}

/**
 * Narrows the detail's flat `actions` list to the ones about the WHOLE
 * notification — the level `Intents.dc.html` draws as the record's own
 * `"actions"`, beside each row's. On the wire both levels arrive in one
 * array, and `rowRef` is what tells them apart, so an action carrying none
 * belongs to the record itself.
 *
 * This is the counterpart of {@link resolveRowActions}: together the two
 * account for every action a record carries. Resolving only from
 * `row.actionIds`, as the pane used to, fetched a whole-notification action
 * and dropped it without a trace — the same silent-drop defect this change
 * already fixed once in the toast layer.
 */
export function resolveNotificationActions(actions: readonly NotificationAction[]): readonly NotificationAction[] {
  return actions.filter((action) => action.rowRef === undefined || action.rowRef === '');
}

/**
 * Formats a record's creation time at BOTH scales the artboard shows —
 * `2026-08-24 14:32:11 · 5m ago`. The absolute half says when it happened
 * and the relative half says whether it still matters; either alone leaves
 * the reader doing arithmetic. `now` is overridable so the label is
 * deterministic under test.
 */
export function formatDetailWhenLabel(createdAtMs: number, now: number = Date.now()): string {
  return `${formatNotificationWhen(createdAtMs)} · ${formatRelativeTimeAgo(createdAtMs, now)}`;
}
