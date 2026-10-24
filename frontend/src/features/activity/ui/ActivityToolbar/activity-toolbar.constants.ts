/** The failure switch's label; its pressed state says whether it is on. */
export const ACTIVITY_FAILURE_SWITCH_LABEL = 'Show only failures';

/** The failure switch's tooltip, off and on (mockup `fails`: what a press does). */
export const ACTIVITY_FAILURE_SWITCH_TOOLTIP = { off: 'Show only failures', on: 'Show all activity' } as const;

/** The origin buttons' tooltips: the words the row origin icon uses (mockup `ORIGIN`). */
export const ACTIVITY_ORIGIN_TOOLTIPS = { phone: 'From the phone', bridge: 'On the bridge' } as const;

/** A type's gray count chip. */
export const ACTIVITY_COUNT_CHIP_CLASS = 'rounded-full bg-background/40 px-1.5 text-[11px] font-normal leading-normal tabular-nums';

/** A type's red chip with its failures (design, Filters): no alert icon, the tooltip "N failed". */
export const ACTIVITY_FAILED_CHIP_CLASS = 'rounded-full bg-danger/20 px-1.5 text-[11px] font-normal leading-normal tabular-nums text-danger';

/** The failure switch (S12 M1; mockup `.ax-failbtn`). */
export const ACTIVITY_FAILURE_CLASSES = {
  /**
   * The pill: 36px tall and fully round, its alert icon before the count.
   * Its background and color change over .2s between soft and solid red.
   */
  pill: 'h-9 gap-1.5 rounded-full px-3 text-sm font-medium [transition:background-color_.2s,color_.2s] motion-reduce:[transition:none]',
  /**
   * The pill's soft red while the switch is off: danger at 18% over the
   * toolbar, its text danger mixed 70% into the foreground.
   */
  pillSoft: 'bg-[color-mix(in_oklab,var(--danger)_18%,transparent)] text-[color-mix(in_oklab,var(--danger)_70%,var(--foreground))]',
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
