import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type {
  NotificationAction,
  NotificationDetail as NotificationDetailDTO,
  NotificationDetailRow as NotificationDetailRowDTO,
} from '../../../../shared/contracts/notification-center.types';

/**
 * Props accepted by the top-level detail pane. `detail` is `null` before any
 * record has been selected or loaded, mirroring `TransactionDetail.tsx`'s
 * own null-detail prompt. `source` is the injected notification source a
 * pressed row action executes against; it is optional and defaults, at the
 * button that finally consumes it, to the runtime-backed singleton --
 * exactly the contract `useNotificationAction` already exposes.
 */
export interface NotificationDetailProps {
  readonly detail: NotificationDetailDTO | null;
  readonly source?: NotificationCenterSource;
}

/** Props accepted by the header block: level chip, source/time line, title, body. */
export interface NotificationDetailHeaderProps {
  readonly detail: NotificationDetailDTO;
}

/** Props accepted by the single bounded row-list block. `source` is forwarded verbatim to each row's action buttons. */
export interface NotificationDetailRowsProps {
  readonly actions: readonly NotificationAction[];
  readonly notificationId: number;
  readonly rows: readonly NotificationDetailRowDTO[];
  readonly source?: NotificationCenterSource;
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
  readonly source?: NotificationCenterSource;
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

/**
 * One labelled value of the pane's metadata footer (`Kind`, `Correlation
 * ID`). Built by `buildNotificationMetaEntries`, which drops an absent field
 * outright rather than emitting an entry with an empty value — an absent
 * value must render as absent, never as an empty labelled row.
 */
export interface NotificationDetailMetaEntry {
  readonly label: string;
  readonly value: string;
}

/** Props accepted by the metadata footer block. An empty `entries` renders no block at all. */
export interface NotificationDetailMetaProps {
  readonly entries: readonly NotificationDetailMetaEntry[];
}

/**
 * Props accepted by the pane's footer action area. `actions` are already
 * narrowed to the record's whole-notification level (via
 * `resolveNotificationActions`); the row-level ones render inside their own
 * rows instead. `source` is forwarded verbatim, exactly as
 * `NotificationDetailRowsProps` forwards it.
 */
export interface NotificationDetailFooterProps {
  readonly actions: readonly NotificationAction[];
  readonly notificationId: number;
  readonly source?: NotificationCenterSource;
}

/**
 * Props accepted by one action button, whether it sits in a row or in the
 * footer. `variant` is the only thing that differs between the two: the
 * artboard fills the footer's leading action and leaves a row's action
 * outlined.
 */
export interface NotificationDetailActionButtonProps {
  readonly action: NotificationAction;
  readonly notificationId: number;
  readonly source?: NotificationCenterSource;
  readonly variant: 'primary' | 'secondary';
}

/** Return value of `useNotificationArchive`. */
export interface UseNotificationArchiveResult {
  readonly archive: () => void;
  readonly isDisabled: boolean;
}
