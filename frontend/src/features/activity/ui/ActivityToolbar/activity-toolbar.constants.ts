import type { IconifyIcon } from '@iconify/react';
import transferIcon from '@iconify-icons/solar/transfer-horizontal-bold';
import refreshIcon from '@iconify-icons/solar/refresh-bold';
import downloadIcon from '@iconify-icons/solar/download-minimalistic-bold';
import clockIcon from '@iconify-icons/solar/clock-circle-bold';
import penIcon from '@iconify-icons/solar/pen-bold';
import bridgeIcon from '@iconify-icons/solar/monitor-linear';
import type { ActivityFailureButtonState } from '../../feed/activity-feed.types';
import type { ActivityFeedType } from '../../feed-source/feed.types';

/** The icon of each failure-menu row: one icon per row (design, The menu). */
export const ACTIVITY_TYPE_ICONS: Readonly<Record<ActivityFeedType, IconifyIcon>> = {
  change: transferIcon,
  traffic: refreshIcon,
  download: downloadIcon,
  task: clockIcon,
  edit: penIcon,
  bridge: bridgeIcon,
};

/** The failure pill's HeroUI variant by state: soft while off or open, solid while on with the menu closed. */
export const ACTIVITY_FAILURE_BUTTON_VARIANT: Readonly<Record<ActivityFailureButtonState, 'danger' | 'danger-soft'>> = {
  off: 'danger-soft',
  open: 'danger-soft',
  on: 'danger',
};

/** The failure pill's tooltip by state. */
export const ACTIVITY_FAILURE_BUTTON_TOOLTIP: Readonly<Record<ActivityFailureButtonState, string>> = {
  off: 'Show only failures',
  open: 'Failures by type',
  on: 'Failures by type',
};

/** A type's gray count chip. */
export const ACTIVITY_COUNT_CHIP_CLASS = 'rounded-full bg-background/40 px-1.5 text-[11px] leading-4 tabular-nums';

/** A type's red chip with its failures (design, Filters): no alert icon, the tooltip "N failed". */
export const ACTIVITY_FAILED_CHIP_CLASS = 'rounded-full bg-danger/20 px-1.5 text-[11px] leading-4 tabular-nums text-danger';

/**
 * The failure pill: 36px tall and fully round, its alert icon before the
 * count, above the menu it grows (S12 M1). Its background and color change
 * over .2s between soft and solid red.
 */
export const ACTIVITY_FAILURE_PILL_CLASS =
  'relative z-[31] h-9 gap-1.5 rounded-full pl-3 text-sm font-medium [transition:background-color_.2s,color_.2s] motion-reduce:[transition:none]';

/**
 * Where the × sits (mockup `.ax-failx`): a 24px circle 6px inside the pill's
 * right end, above the menu. The shared 32px icon button is scaled to 24px
 * and centred in that box, which keeps it inside the pill's 36px end padding.
 */
export const ACTIVITY_FAILURE_X_CLASS = 'absolute right-1.5 top-1.5 z-[32] grid size-6 place-items-center [&>*]:scale-75';

/** A failure menu row: icon, name and count. Selected rows take the neutral `bg-default`, unselected rows read gray. */
export const ACTIVITY_FAILURE_ROW_CLASS = 'group h-[34px] min-h-0 gap-2.5 rounded-[0.6rem] px-2.5 text-sm text-muted data-[selected=true]:bg-default data-[selected=true]:text-foreground';

/** The id that ties the failure pill to the menu it controls. */
export const ACTIVITY_FAILURE_MENU_ID = 'activity-failure-menu';

/**
 * The failure menu's container (S12 M1, mockup `.ax-failpop`): anchored 6px
 * past the pill's top-right corner, 236px wide, with 48px on top for the
 * header row the pill completes.
 */
export const ACTIVITY_FAILURE_POPOVER_CLASS =
  'absolute -right-1.5 -top-1.5 z-30 w-[236px] rounded-2xl bg-surface-secondary px-1.5 pb-1.5 pt-12 shadow-[0_0_0_1px_#ffffff12,0_12px_32px_-6px_#000000b3,0_4px_12px_-4px_#00000080] motion-reduce:[transition:none]';

/**
 * The failure menu's two states (S12 M1): closed, it is clipped to the pill's
 * own box (`--bw` is the pill's width) and fades out over .12s, hiding after
 * the .2s grow; open, the clip grows to the whole menu over .2s
 * `cubic-bezier(.2,0,0,1)` and it fades in over .08s.
 */
export const ACTIVITY_FAILURE_POPOVER_STATE_CLASS = {
  closed:
    'invisible opacity-0 [clip-path:inset(0_0_calc(100%_-_48px)_calc(100%_-_var(--bw,60px)_-_12px)_round_24px)] [transition:clip-path_.2s_cubic-bezier(.2,0,0,1),opacity_.12s_ease-out,visibility_0s_linear_.2s]',
  open: 'visible opacity-100 [clip-path:inset(0_0_0_0_round_1rem)] [transition:clip-path_.2s_cubic-bezier(.2,0,0,1),opacity_.08s_ease-out,visibility_0s]',
} as const;
