import type { IconifyIcon } from '@iconify/react';
import transferIcon from '@iconify-icons/solar/transfer-horizontal-bold';
import refreshIcon from '@iconify-icons/solar/refresh-bold';
import downloadIcon from '@iconify-icons/solar/download-minimalistic-bold';
import clockIcon from '@iconify-icons/solar/clock-circle-bold';
import penIcon from '@iconify-icons/solar/pen-bold';
import systemIcon from '@iconify-icons/solar/cpu-bold';
import type { ActivityFailureButtonState } from '../../feed/activity-feed.types';
import type { ActivityFeedType } from '../../feed-source/feed.types';

/** The icon of each failure-menu row: one icon per row (design, The menu). */
export const ACTIVITY_TYPE_ICONS: Readonly<Record<ActivityFeedType, IconifyIcon>> = {
  change: transferIcon,
  traffic: refreshIcon,
  download: downloadIcon,
  task: clockIcon,
  edit: penIcon,
  system: systemIcon,
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
export const ACTIVITY_COUNT_CHIP_CLASS = 'rounded-full bg-background/40 px-1.5 text-[11px] font-normal leading-normal tabular-nums';

/** A type's red chip with its failures (design, Filters): no alert icon, the tooltip "N failed". */
export const ACTIVITY_FAILED_CHIP_CLASS = 'rounded-full bg-danger/20 px-1.5 text-[11px] font-normal leading-normal tabular-nums text-danger';

/** The id that ties the failure pill to the menu it controls. */
export const ACTIVITY_FAILURE_MENU_ID = 'activity-failure-menu';

/** The failure pill and its menu (S12 M1; mockup `.ax-failbtn`, `.ax-failx`, `.ax-failpop`). */
export const ACTIVITY_FAILURE_CLASSES = {
  /**
   * The pill: 36px tall and fully round, its alert icon before the count,
   * above the menu it grows. Its background and color change over .2s between
   * soft and solid red.
   */
  pill: 'relative z-[31] h-9 gap-1.5 rounded-full pl-3 text-sm font-medium [transition:background-color_.2s,color_.2s] motion-reduce:[transition:none]',
  /**
   * The pill's soft red while the filter is off or its menu is open: danger at
   * 18% over the toolbar, its text danger mixed 70% into the foreground.
   */
  pillSoft: 'bg-[color-mix(in_oklab,var(--danger)_18%,transparent)] text-[color-mix(in_oklab,var(--danger)_70%,var(--foreground))]',
  /**
   * Where the × sits: a 24px circle 6px inside the pill's right end, above the
   * menu, so its centre is 18px from the pill's top and right edges. The box
   * matches the shared 32px icon button and shares that centre (2px inset);
   * the button is then scaled to 24px around it. A 24px box would not centre
   * the wider button: an overflowing grid item aligns to start.
   */
  x: 'absolute right-0.5 top-0.5 z-[32] grid size-8 place-items-center [&>*]:scale-75',
  /**
   * A menu row: icon, name and count. Selected rows take the neutral
   * `bg-default`, unselected rows read gray. The keyboard focus ring is drawn
   * inside the row: HeroUI's offset ring paints the page color between the row
   * and the ring inside the lighter menu, and spills onto the rows 2px away.
   */
  row: 'group h-[34px] min-h-0 gap-2.5 rounded-[0.6rem] px-2.5 text-sm text-muted data-[selected=true]:bg-default data-[selected=true]:text-foreground data-[focus-visible=true]:ring-inset data-[focus-visible=true]:ring-offset-0',
  /**
   * The menu's container: anchored 6px past the pill's top-right corner, 236px
   * wide, with 48px on top for the header row the pill completes.
   */
  popover:
    'absolute -right-1.5 -top-1.5 z-30 w-[236px] rounded-2xl bg-surface-secondary px-1.5 pb-1.5 pt-12 shadow-[0_0_0_1px_#ffffff12,0_12px_32px_-6px_#000000b3,0_4px_12px_-4px_#00000080] motion-reduce:[transition:none]',
  /**
   * The menu's two states: closed, it is clipped to the pill's own box (`--bw`
   * is the pill's width) and fades out over .12s, hiding after the .2s grow;
   * open, the clip grows to the whole menu over .2s `cubic-bezier(.2,0,0,1)`
   * and it fades in over .08s.
   */
  popoverState: {
    closed:
      'invisible opacity-0 [clip-path:inset(0_0_calc(100%_-_48px)_calc(100%_-_var(--bw,60px)_-_12px)_round_24px)] [transition:clip-path_.2s_cubic-bezier(.2,0,0,1),opacity_.12s_ease-out,visibility_0s_linear_.2s]',
    open: 'visible opacity-100 [clip-path:inset(0_0_0_0_round_1rem)] [transition:clip-path_.2s_cubic-bezier(.2,0,0,1),opacity_.08s_ease-out,visibility_0s]',
  },
} as const;

/**
 * The range picker popover (mockup `.ax-pop`: 320px, 14px padding). When the
 * window leaves too little room for a six-week month, the popover scrolls with
 * a visible scrollbar instead of HeroUI's hidden one, so Clear and Apply stay reachable.
 */
export const ACTIVITY_RANGE_POPOVER_CLASS = 'w-80 p-3.5 [scrollbar-width:thin]';

/** The range calendar fills the picker (mockup `.ax-pop`: 320px with 14px padding). */
export const ACTIVITY_RANGE_CALENDAR_CLASS = 'w-full max-w-none';

/**
 * A range calendar day as the mockup draws it (`.ax-cal button`): a 34px circle
 * in a full-width track, today ringed rather than filled unless it ends the
 * range, disabled days greyed without a strike, other months' days blank.
 */
export const ACTIVITY_RANGE_CELL_CLASS = [
  'my-px data-[outside-month=true]:invisible data-[disabled=true]:no-underline',
  '*:mx-auto *:aspect-auto *:size-[34px]',
  '*:text-[13px] *:font-normal *:tabular-nums',
  'data-[today=true]:*:shadow-[inset_0_0_0_1px_var(--muted)]',
  'data-[today=true]:not-data-[selection-start=true]:not-data-[selection-end=true]:*:bg-transparent',
  'data-[today=true]:not-data-[selection-start=true]:not-data-[selection-end=true]:*:text-foreground',
].join(' ');
