import type {
  NotificationAction,
  NotificationDetail as NotificationDetailDTO,
  NotificationDetailRow as NotificationDetailRowDTO,
} from '../../../../shared/contracts/notification-center.types';

/**
 * Props accepted by the top-level detail pane. `detail` is `null` before any
 * record has been selected or loaded, mirroring `TransactionDetail.tsx`'s
 * own null-detail prompt.
 */
export interface NotificationDetailProps {
  readonly detail: NotificationDetailDTO | null;
}

/** Props accepted by the header block: level chip, source/time line, title, body. */
export interface NotificationDetailHeaderProps {
  readonly detail: NotificationDetailDTO;
}

/** Props accepted by the single bounded row-list block. */
export interface NotificationDetailRowsProps {
  readonly actions: readonly NotificationAction[];
  readonly notificationId: number;
  readonly rows: readonly NotificationDetailRowDTO[];
}

/**
 * Props accepted by one detail row. `actions` are already resolved to this
 * row's own action tokens (via `resolveRowActions`, from `row.actionIds`).
 * `coverEntry` is `undefined` while a cover fetch is still in flight or has
 * not started -- the row falls back to the placeholder art in that case,
 * exactly as when the entry resolves to `{ status: 'placeholder' }`.
 * `notificationId` identifies the owning record so a pressed action can be
 * validated as belonging to it (`ExecuteNotificationAction`'s foreign_action
 * check).
 */
export interface NotificationDetailRowProps {
  readonly actions: readonly NotificationAction[];
  readonly coverEntry?: NotificationCoverEntry;
  readonly notificationId: number;
  readonly row: NotificationDetailRowDTO;
}

/**
 * One row's cover-resolution outcome, mirroring
 * `EpisodeSchedulePanel`'s `CoverEntry` shape exactly (same lazy-fetch,
 * per-session cache contract, different feature).
 */
export type NotificationCoverEntry = { readonly status: 'loading' | 'placeholder' } | { readonly status: 'cover'; readonly dataUrl: string };

/**
 * The rendering state a pressed action settles into, layered over the
 * server-known `NotificationAction` fields (`executedAtMs`/`refusedReason`).
 * `'pending'` is the optimistic, disabled-but-not-yet-settled state a press
 * enters immediately; it never survives a re-render once the server (or,
 * before Slice 5, the inert stand-in) settles it to `'executed'` or
 * `'refused'`.
 */
export type NotificationActionUIStatus = 'idle' | 'pending' | 'executed' | 'refused';

/** Return value of `useNotificationAction`. */
export interface UseNotificationActionResult {
  readonly isDisabled: boolean;
  readonly press: () => void;
  readonly refusalMessage?: string;
  readonly status: NotificationActionUIStatus;
}
